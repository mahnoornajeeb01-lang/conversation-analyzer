"""FastAPI application entry point for the Conversation Timing Analyzer."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable, Dict, Generator, Iterator, List, Optional, Tuple, TypeVar

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from app.core.config import settings
from app.models.schema import AnalysisReport, SpeakerSegment, Transcript
from app.services import diarization, insights, pdf_report, transcription
from app.services.analysis import generate_report

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("conversation_analyzer.main")

SAMPLE_RATE = 16000

# Diarization runs here while the request thread transcribes and scores emotions.
# (Scoring emotions concurrently with transcription too was measured: the CPU is
# already saturated, so it only delayed the transcript without finishing sooner.)
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="pipeline")


def _warm_up_models() -> None:
    """Load every model once so the first upload doesn't pay for it. Runs in the
    background; a request arriving meanwhile simply waits on the loader's lock."""
    started = time.perf_counter()
    for name, fn in (
        ("speech-to-text", transcription.warm_up),
        ("diarization", diarization.warm_up),
        ("emotions", insights.warm_up_emotions),
    ):
        try:
            fn()
        except Exception:
            logger.exception("Warm-up of %s failed; it will be retried on first use.", name)
    logger.info("Models ready in %.1fs", time.perf_counter() - started)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.preload_models:
        threading.Thread(target=_warm_up_models, name="warm-up", daemon=True).start()
    yield
    _executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(
    title="Conversation Timing Analyzer API",
    description="Speech-to-text, speaker diarization, response latency, overlap, interruption and emotion analysis for conversations.",
    version="1.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.get("/api/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "service": "conversation-timing-analyzer",
        "mock_diarization_forced": settings.use_mock_diarization,
        "whisper_model": settings.whisper_model,
        "emotion_source": settings.emotion_source,
    }


def _validate_language(language: Optional[str]) -> Optional[str]:
    """'auto'/empty -> None (detect); otherwise a Whisper language code."""
    if not language or language.strip().lower() in {"auto", "detect"}:
        return None
    code = language.strip().lower()
    try:
        from faster_whisper.tokenizer import _LANGUAGE_CODES  # type: ignore

        if code not in _LANGUAGE_CODES:
            raise HTTPException(status_code=400, detail=f"Unsupported language code '{language}'.")
    except ImportError:
        pass
    return code


async def _read_validated_upload(file: UploadFile) -> Tuple[bytes, str]:
    """Validate the upload (name, extension, size) and return (contents, extension)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file was uploaded.")

    extension = Path(file.filename).suffix.lower()
    if extension not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{extension}'. "
                f"Allowed types: {', '.join(settings.allowed_extensions)}"
            ),
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds the {settings.max_upload_size_mb}MB upload limit.",
        )
    return contents, extension


def _decode(temp_path: Path) -> np.ndarray:
    """Decode once to 16 kHz mono; every stage shares this array."""
    from faster_whisper import decode_audio

    try:
        audio = decode_audio(str(temp_path), sampling_rate=SAMPLE_RATE)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The audio file could not be decoded.") from exc
    if audio.size == 0:
        raise HTTPException(status_code=422, detail="The audio file contains no samples.")
    return audio


def _timed(timings: Dict[str, float], key: str, fn, *args):
    started = time.perf_counter()
    try:
        return fn(*args)
    finally:
        timings[key] = round(time.perf_counter() - started, 2)


def _transcribe_or_raise(audio: np.ndarray, language: Optional[str]) -> Transcript:
    try:
        result = transcription.transcribe_audio(audio, language)
    except transcription.TranscriptionUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if not result.segments:
        raise HTTPException(
            status_code=422,
            detail="No speech could be transcribed from the uploaded audio.",
        )
    return Transcript(
        segments=result.segments,
        language=result.language,
        language_probability=result.language_probability,
        language_source=result.language_source,  # type: ignore[arg-type]
        language_alternatives=result.language_alternatives,
        model=settings.whisper_model,
        word_count=sum(len(s.text.split()) for s in result.segments),
    )


class _Pipeline:
    """One analysis run. Diarization starts immediately in a worker thread and overlaps
    with transcription and emotion scoring, which don't need speaker labels."""

    def __init__(self, temp_path: Path, filename: str, language: Optional[str]) -> None:
        self.started = time.perf_counter()
        self.timings: Dict[str, float] = {}
        self.filename = filename
        self.language = language
        self.audio = _timed(self.timings, "decode", _decode, temp_path)
        self.diarization: Future = _executor.submit(
            _timed, self.timings, "diarization", diarization.diarize_audio, self.audio
        )

    def transcribe(self) -> Transcript:
        return _timed(self.timings, "transcription", _transcribe_or_raise, self.audio, self.language)

    def analyze(self, transcript: Transcript) -> AnalysisReport:
        tagged, emotion_source = _timed(
            self.timings, "emotions", insights.tag_emotions, self.audio, transcript.segments, transcript.language
        )

        waited = time.perf_counter()
        speaker_segments: List[SpeakerSegment]
        speaker_segments, source = self.diarization.result()
        self.timings["waiting_for_diarization"] = round(time.perf_counter() - waited, 2)
        if not speaker_segments:
            raise HTTPException(
                status_code=422,
                detail="No speech segments could be detected in the uploaded audio.",
            )

        labeled = transcription.assign_speakers(tagged, speaker_segments)
        report = generate_report(speaker_segments, filename=self.filename, diarization_source=source)
        report.transcript = transcript.model_copy(update={"segments": labeled})
        report.emotions = insights.summarize_emotions(labeled, report.speakers)
        report.emotion_source = emotion_source  # type: ignore[assignment]
        report.speaker_profiles = insights.build_speaker_profiles(report.speakers, speaker_segments, labeled)
        self.timings["total"] = round(time.perf_counter() - self.started, 2)
        report.timings = dict(self.timings)
        logger.info("Analysis of '%s' finished: %s", self.filename, report.timings)
        return report

    def cancel(self) -> None:
        self.diarization.cancel()


@app.post("/api/analyze", response_model=AnalysisReport)
async def analyze_audio(
    file: UploadFile = File(...), language: Optional[str] = Form(None)
) -> AnalysisReport:
    """Transcribe the recording, then run the full analysis. Returns one report."""
    language = _validate_language(language)
    contents, extension = await _read_validated_upload(file)
    temp_path = settings.data_dir / f"{uuid.uuid4().hex}{extension}"

    def run() -> AnalysisReport:
        pipeline = _Pipeline(temp_path, file.filename or "recording", language)
        try:
            return pipeline.analyze(pipeline.transcribe())
        except Exception:
            pipeline.cancel()
            raise

    try:
        temp_path.write_bytes(contents)
        from starlette.concurrency import run_in_threadpool

        return await run_in_threadpool(run)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to analyze uploaded audio file '%s'", file.filename)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while analyzing the audio file.",
        )
    finally:
        temp_path.unlink(missing_ok=True)


def _event(payload: dict) -> bytes:
    return (json.dumps(payload) + "\n").encode("utf-8")


T = TypeVar("T")

# Proxies in front of the server (e.g. a Cloudflare tunnel) drop a response that sends
# nothing for ~100 s, and a long recording can take longer than that per stage.
HEARTBEAT_SECONDS = 15.0


def _with_heartbeat(fn: Callable[[], T]) -> Generator[bytes, None, T]:
    """Run fn on its own thread, yielding a blank line (ignored by the client) every
    HEARTBEAT_SECONDS until it finishes; returns fn's result via `yield from`."""
    future: Future = Future()

    def target() -> None:
        try:
            future.set_result(fn())
        except BaseException as exc:
            future.set_exception(exc)

    threading.Thread(target=target, name="stream-stage", daemon=True).start()
    while True:
        try:
            return future.result(timeout=HEARTBEAT_SECONDS)
        except FutureTimeout:
            yield b"\n"


@app.post("/api/analyze/stream")
async def analyze_audio_stream(
    file: UploadFile = File(...), language: Optional[str] = Form(None)
) -> StreamingResponse:
    """Same pipeline as /api/analyze, streamed as newline-delimited JSON so the client
    can show the transcript as soon as speech-to-text finishes, before analysis runs.

    Events: {"stage": "transcribing"} -> {"stage": "transcript", "transcript": {...}}
    -> {"stage": "analyzing"} -> {"stage": "report", "report": {...}},
    or {"stage": "error", "detail": "..."} at any point.
    """
    language = _validate_language(language)
    contents, extension = await _read_validated_upload(file)
    filename = file.filename or "recording"
    temp_path = settings.data_dir / f"{uuid.uuid4().hex}{extension}"
    temp_path.write_bytes(contents)

    def events() -> Iterator[bytes]:
        pipeline: Optional[_Pipeline] = None
        try:
            yield _event({"stage": "transcribing"})
            pipeline = _Pipeline(temp_path, filename, language)
            transcript = yield from _with_heartbeat(pipeline.transcribe)
            yield _event({"stage": "transcript", "transcript": transcript.model_dump()})

            yield _event({"stage": "analyzing"})
            report = yield from _with_heartbeat(lambda: pipeline.analyze(transcript))
            yield _event({"stage": "report", "report": report.model_dump()})
        except HTTPException as exc:
            if pipeline:
                pipeline.cancel()
            yield _event({"stage": "error", "detail": exc.detail})
        except Exception:
            if pipeline:
                pipeline.cancel()
            logger.exception("Failed to analyze uploaded audio file '%s'", filename)
            yield _event(
                {
                    "stage": "error",
                    "detail": "An unexpected error occurred while analyzing the audio file.",
                }
            )
        finally:
            temp_path.unlink(missing_ok=True)

    return StreamingResponse(events(), media_type="application/x-ndjson")


@app.post("/api/report/pdf")
def report_pdf(report: AnalysisReport) -> Response:
    """Render a finished analysis report as a downloadable PDF."""
    try:
        pdf = pdf_report.build_pdf(report)
    except Exception:
        logger.exception("PDF generation failed for '%s'", report.filename)
        raise HTTPException(status_code=500, detail="Could not generate the PDF report.")
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(report.filename).stem) or "conversation"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{stem}-analysis.pdf"'},
    )
