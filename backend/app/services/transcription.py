"""Speech-to-text: turns an audio file into timestamped transcript segments.

Uses faster-whisper (CTranslate2 build of OpenAI Whisper), which decodes audio itself
via PyAV so no system ffmpeg is required. The model is downloaded from the HuggingFace
hub on first use and cached, then loaded lazily and reused for later requests.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from app.core.config import settings
from app.models.schema import LanguageGuess, SpeakerSegment, TranscriptSegment

logger = logging.getLogger("conversation_analyzer.transcription")

_model = None
_model_lock = threading.Lock()


class TranscriptionUnavailableError(RuntimeError):
    """Raised when the speech-to-text model cannot be loaded or run."""


def _get_model():
    """Lazily load and cache the Whisper model (thread-safe)."""
    global _model

    with _model_lock:
        if _model is not None:
            return _model

        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as exc:
            raise TranscriptionUnavailableError(
                "faster-whisper is not installed. Run `pip install -r requirements.txt`."
            ) from exc

        try:
            logger.info(
                "Loading Whisper model '%s' (device=%s, compute_type=%s)...",
                settings.whisper_model,
                settings.whisper_device,
                settings.whisper_compute_type,
            )
            _model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
        except Exception as exc:
            logger.exception("Failed to load Whisper model '%s'", settings.whisper_model)
            raise TranscriptionUnavailableError(
                f"Could not load the '{settings.whisper_model}' speech-to-text model. "
                "The first run needs internet access to download it."
            ) from exc

        return _model


@dataclass
class TranscriptionResult:
    segments: List[TranscriptSegment]
    language: Optional[str]
    language_probability: Optional[float]
    language_source: str  # "detected" or "selected"
    language_alternatives: List[LanguageGuess] = field(default_factory=list)


def warm_up() -> None:
    """Load the model ahead of the first request."""
    _get_model()


def transcribe_audio(audio: np.ndarray, language: Optional[str] = None) -> TranscriptionResult:
    """Transcribe 16 kHz mono audio. Segments have no speaker yet; see `assign_speakers`.

    With `language=None` Whisper detects it, sampling `language_detection_segments`
    30 s windows rather than only the opening, which is often silence, music or a
    greeting too short to identify. Passing a code (e.g. "ur") skips detection.
    """
    model = _get_model()
    language = language or None

    try:
        raw_segments, info = model.transcribe(
            audio,
            language=language,
            beam_size=settings.whisper_beam_size,
            vad_filter=True,
            language_detection_segments=max(1, settings.language_detection_segments),
        )
        # Whisper can report a final segment ending past the end of the audio;
        # clamp to the real duration so transcript and timing data agree.
        duration = getattr(info, "duration", None) or float("inf")
        segments: List[TranscriptSegment] = []
        for seg in raw_segments:
            end = min(seg.end, duration)
            if not seg.text.strip() or end <= seg.start:
                continue
            line = TranscriptSegment(start=round(seg.start, 3), end=round(end, 3), text=seg.text.strip())
            segments.append(line)
    except TranscriptionUnavailableError:
        raise
    except Exception as exc:
        logger.exception("Transcription failed")
        raise TranscriptionUnavailableError("Speech-to-text failed on this audio file.") from exc

    alternatives: List[LanguageGuess] = []
    if language is None:
        ranked = sorted(getattr(info, "all_language_probs", None) or [], key=lambda lp: lp[1], reverse=True)
        alternatives = [
            LanguageGuess(code=code, probability=round(float(prob), 3))
            for code, prob in ranked[1:4]
            if prob >= 0.02
        ]
    logger.info(
        "Language: %s (p=%.2f, %s)", info.language, info.language_probability or 0, "selected" if language else "detected"
    )
    return TranscriptionResult(
        segments=segments,
        language=getattr(info, "language", None),
        language_probability=None if language else round(float(info.language_probability), 3),
        language_source="selected" if language else "detected",
        language_alternatives=alternatives,
    )


def assign_speakers(
    transcript: List[TranscriptSegment],
    speaker_segments: List[SpeakerSegment],
) -> List[TranscriptSegment]:
    """Attach a speaker label to each transcript segment: the diarized speaker with the
    most time overlapping it, or the nearest diarized segment if none overlap."""
    if not speaker_segments:
        return transcript

    labeled: List[TranscriptSegment] = []
    for line in transcript:
        overlap_by_speaker: dict[str, float] = {}
        for seg in speaker_segments:
            overlap = min(line.end, seg.end) - max(line.start, seg.start)
            if overlap > 0:
                overlap_by_speaker[seg.speaker] = overlap_by_speaker.get(seg.speaker, 0.0) + overlap

        if overlap_by_speaker:
            speaker = max(overlap_by_speaker, key=overlap_by_speaker.get)  # type: ignore[arg-type]
        else:
            midpoint = (line.start + line.end) / 2
            speaker = min(
                speaker_segments,
                key=lambda s: min(abs(midpoint - s.start), abs(midpoint - s.end)),
            ).speaker

        labeled.append(line.model_copy(update={"speaker": speaker}))

    return labeled
