"""FastAPI application entry point for the Conversation Timing Analyzer."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import uuid
from concurrent.futures import Future
from concurrent.futures import TimeoutError as FutureTimeout
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable, Dict, Generator, Iterator, List, Tuple, TypeVar

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.models.schema import AnalysisReport, SpeakerSegment
from app.services import diarization, pdf_report, transcription
from app.services.analysis import generate_report

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("conversation_analyzer.main")

SAMPLE_RATE = 16000


def _warm_up_models() -> None:
    """Load the diarization and speech-to-text models once so the first upload doesn't
    pay for them. Runs in the background; a request arriving meanwhile simply waits on
    the loaders' locks."""
    started = time.perf_counter()
    for name, warm_up in (("diarization", diarization.warm_up), ("transcription", transcription.warm_up)):
        try:
            warm_up()
        except Exception:
            logger.exception("Warm-up of %s failed; it will be retried on first use.", name)
    logger.info("Models ready in %.1fs", time.perf_counter() - started)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.preload_models:
        threading.Thread(target=_warm_up_models, name="warm-up", daemon=True).start()
    yield


app = FastAPI(
    title="Conversation Timing Analyzer API",
    description="Speaker diarization, response latency, overlap and interruption analysis for conversations.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex or None,
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
    }


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
    """Decode any supported file to 16 kHz mono float32 with PyAV (bundles FFmpeg, so no
    system install is needed)."""
    import av

    try:
        chunks = []
        with av.open(str(temp_path)) as container:
            stream = next((s for s in container.streams if s.type == "audio"), None)
            if stream is None:
                raise HTTPException(status_code=422, detail="The file contains no audio track.")
            resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(stream):
                chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(frame)]
            chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail="The audio file could not be decoded.") from exc
    if not chunks:
        raise HTTPException(status_code=422, detail="The audio file contains no samples.")
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def _timed(timings: Dict[str, float], key: str, fn, *args):
    started = time.perf_counter()
    try:
        return fn(*args)
    finally:
        timings[key] = round(time.perf_counter() - started, 2)


Analysis = Tuple[AnalysisReport, np.ndarray, List[SpeakerSegment], float]


def _analyze_timing(temp_path: Path, filename: str) -> Analysis:
    """Decode, find who spoke when, then measure latency, overlaps and interruptions.
    Returns the report plus what transcription needs (audio, segments, start time)."""
    started = time.perf_counter()
    timings: Dict[str, float] = {}
    audio = _timed(timings, "decode", _decode, temp_path)
    try:
        speaker_segments, source = _timed(timings, "diarization", diarization.diarize_audio, audio)
    except diarization.DiarizationUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"{exc} Please try again, or check the server log.") from exc
    if not speaker_segments:
        raise HTTPException(
            status_code=422,
            detail="No speech was detected in this recording, so there is nothing to measure. "
            "Upload a recording of people talking.",
        )
    report = generate_report(speaker_segments, filename=filename, diarization_source=source)
    report.timings = timings
    return report, audio, speaker_segments, started


def _add_transcript(analysis: Analysis) -> AnalysisReport:
    """Transcribe the recording into the report. A failure here keeps the timing
    analysis and records why the transcript is missing."""
    report, audio, speaker_segments, started = analysis
    if settings.transcription_enabled:
        try:
            report.transcript = _timed(report.timings, "transcription", transcription.transcribe, audio, speaker_segments)
        except transcription.TranscriptionUnavailable as exc:
            report.transcript_error = str(exc)
    report.timings["total"] = round(time.perf_counter() - started, 2)
    logger.info("Analysis of '%s' finished: %s", report.filename, report.timings)
    return report


def _analyze(temp_path: Path, filename: str) -> AnalysisReport:
    return _add_transcript(_analyze_timing(temp_path, filename))


@app.post("/api/analyze", response_model=AnalysisReport)
async def analyze_audio(file: UploadFile = File(...)) -> AnalysisReport:
    """Run the full analysis and return one report."""
    contents, extension = await _read_validated_upload(file)
    temp_path = settings.data_dir / f"{uuid.uuid4().hex}{extension}"
    try:
        temp_path.write_bytes(contents)
        return await run_in_threadpool(_analyze, temp_path, file.filename or "recording")
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
# nothing for ~100 s, and a long recording can take longer than that to diarize.
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
async def analyze_audio_stream(file: UploadFile = File(...)) -> StreamingResponse:
    """Same pipeline as /api/analyze, streamed as newline-delimited JSON with heartbeats
    so long recordings survive proxies.

    Events: {"stage": "analyzing"} -> {"stage": "transcribing"} ->
    {"stage": "report", "report": {...}}, or {"stage": "error", "detail": "..."}.
    """
    contents, extension = await _read_validated_upload(file)
    filename = file.filename or "recording"
    temp_path = settings.data_dir / f"{uuid.uuid4().hex}{extension}"
    temp_path.write_bytes(contents)

    def events() -> Iterator[bytes]:
        try:
            yield _event({"stage": "analyzing"})
            analysis = yield from _with_heartbeat(lambda: _analyze_timing(temp_path, filename))
            if settings.transcription_enabled:
                yield _event({"stage": "transcribing"})
            report = yield from _with_heartbeat(lambda: _add_transcript(analysis))
            yield _event({"stage": "report", "report": report.model_dump()})
        except HTTPException as exc:
            yield _event({"stage": "error", "detail": exc.detail})
        except Exception:
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


# Serve the dashboard itself last, so the /api routes above take precedence.
if (settings.frontend_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="dashboard")
else:
    logger.info("No dashboard build at %s; serving the API only.", settings.frontend_dir)
