"""Diarization and speech-to-text through pyannoteAI's hosted API (https://docs.pyannote.ai).

Used when ANALYSIS_ENGINE=pyannoteai: the recording is uploaded to pyannoteAI, which runs
its overlap-aware diarization model plus Whisper and returns who spoke when and the words
each speaker said. Nothing heavy runs on this server, so it fits a small free host.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
import uuid
from typing import List, Optional, Tuple

from app.core.config import settings
from app.models.schema import SpeakerSegment, Transcript
from app.services.diarization import _normalize_speaker_labels
from app.services.transcription import LANGUAGE_NAMES, RTL_LANGUAGES, _group_words

logger = logging.getLogger("conversation_analyzer.pyannote_ai")

API = "https://api.pyannote.ai/v1"
POLL_SECONDS = 3.0
# Jobs normally finish in a fraction of the recording's length; this only stops a stuck
# job from holding the request forever.
TIMEOUT_SECONDS = 60 * 60


class PyannoteAIError(RuntimeError):
    """The API rejected the request, failed the job, or couldn't be reached."""


def _request(method: str, url: str, body: Optional[bytes] = None, headers: Optional[dict] = None) -> bytes:
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        logger.error("pyannoteAI %s %s failed: %s %s", method, url, exc.code, detail)
        if exc.code in (401, 403):
            raise PyannoteAIError("The pyannoteAI API key was rejected. Check PYANNOTEAI_API_KEY.") from exc
        if exc.code == 402:
            raise PyannoteAIError("The pyannoteAI account has run out of credit.") from exc
        raise PyannoteAIError(f"pyannoteAI returned an error ({exc.code}).") from exc
    except urllib.error.URLError as exc:
        raise PyannoteAIError("Could not reach pyannoteAI. Please try again.") from exc


def _api(method: str, path: str, payload: Optional[dict] = None) -> dict:
    headers = {"Authorization": f"Bearer {settings.pyannoteai_api_key}"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")
    return json.loads(_request(method, f"{API}{path}", body, headers) or b"{}")


def _run_job(audio: bytes) -> dict:
    """Upload the recording, start a diarization + transcription job, wait for its output."""
    if not settings.pyannoteai_api_key:
        raise PyannoteAIError("PYANNOTEAI_API_KEY is not set on the server.")

    media = f"media://conversation-analyzer/{uuid.uuid4().hex}"
    upload_url = _api("POST", "/media/input", {"url": media})["url"]
    _request("PUT", upload_url, audio, {"Content-Type": "application/octet-stream"})

    job = _api(
        "POST",
        "/diarize",
        {
            "url": media,
            "model": settings.pyannoteai_model,
            "transcription": True,
            "transcriptionConfig": {"model": settings.pyannoteai_transcription_model},
        },
    )
    job_id = job["jobId"]
    deadline = time.monotonic() + TIMEOUT_SECONDS
    while True:
        job = _api("GET", f"/jobs/{job_id}")
        status = job.get("status")
        if status == "succeeded":
            return job.get("output") or {}
        if status in ("failed", "canceled"):
            logger.error("pyannoteAI job %s %s: %s", job_id, status, job)
            raise PyannoteAIError(f"pyannoteAI could not process this recording (job {status}).")
        if time.monotonic() > deadline:
            raise PyannoteAIError("pyannoteAI took too long to process this recording.")
        time.sleep(POLL_SECONDS)


def _transcript(output: dict, segments: List[SpeakerSegment]) -> Optional[Transcript]:
    words = [
        (float(w["start"]), float(w["end"]), w["text"] if w["text"].startswith(" ") else " " + w["text"])
        for w in output.get("wordLevelTranscription") or []
        if w.get("text", "").strip()
    ]
    if not words and not output.get("turnLevelTranscription"):
        return None
    utterances = _group_words(words, segments)
    language = (output.get("language") or output.get("languageCode") or "").lower()
    return Transcript(
        language=language,
        language_name=LANGUAGE_NAMES.get(language, language.upper() or "Not reported"),
        language_probability=None,
        right_to_left=language in RTL_LANGUAGES,
        segments=utterances,
        word_count=sum(len(u.text.split()) for u in utterances),
        model=settings.pyannoteai_transcription_model,
    )


def analyze(audio: bytes) -> Tuple[List[SpeakerSegment], Optional[Transcript]]:
    """Speaker segments (overlaps included) and the speaker-attributed transcript."""
    output = _run_job(audio)
    raw = [(s["speaker"], float(s["start"]), float(s["end"])) for s in output.get("diarization") or []]
    segments = _normalize_speaker_labels(raw)
    return segments, (_transcript(output, segments) if segments else None)
