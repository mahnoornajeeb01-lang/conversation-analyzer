"""Speaker diarization: turns an audio file into a list of SpeakerSegment timestamps.

Uses pyannote.audio's pretrained pipeline (`pyannote/speaker-diarization-3.1`) when it
is installed, importable, and a HuggingFace access token is configured. Otherwise (or
if the pipeline fails to load / run for any reason) it falls back to a deterministic
mock generator so the rest of the application can be developed and tested without a
GPU or gated model access.
"""

from __future__ import annotations

import logging
import random
import threading
from typing import List, Optional, Tuple

import numpy as np

from app.core.config import settings
from app.models.schema import SpeakerSegment

logger = logging.getLogger("conversation_analyzer.diarization")

_pipeline = None
_pipeline_load_failed = False
_pipeline_lock = threading.Lock()

SAMPLE_RATE = 16000


def _try_import_pyannote():
    try:
        from pyannote.audio import Pipeline  # type: ignore

        return Pipeline
    except ImportError:
        return None


def _get_pipeline():
    """Lazily load and cache the pyannote.audio diarization pipeline."""
    with _pipeline_lock:
        return _load_pipeline()


def _load_pipeline():
    global _pipeline, _pipeline_load_failed

    if _pipeline is not None:
        return _pipeline
    if _pipeline_load_failed:
        return None

    pipeline_cls = _try_import_pyannote()
    if pipeline_cls is None:
        logger.warning("pyannote.audio is not installed; diarization will use mock data.")
        _pipeline_load_failed = True
        return None

    if not settings.huggingface_token:
        logger.warning(
            "No HUGGINGFACE_TOKEN configured; diarization will use mock data. "
            "Set HUGGINGFACE_TOKEN in backend/.env to enable pyannote.audio."
        )
        _pipeline_load_failed = True
        return None

    try:
        _pipeline = pipeline_cls.from_pretrained(
            settings.diarization_model,
            use_auth_token=settings.huggingface_token,
        )
        # Speaker embeddings are ~97% of CPU time, one per analysis window; a wider hop
        # computes far fewer of them (see settings.diarization_step_seconds).
        segmentation = getattr(_pipeline, "_segmentation", None)
        if segmentation is not None and settings.diarization_step_seconds > 0:
            segmentation.step = min(settings.diarization_step_seconds, segmentation.duration)
        return _pipeline
    except Exception:
        logger.exception(
            "Failed to load pyannote.audio pipeline '%s'; falling back to mock diarization.",
            settings.diarization_model,
        )
        _pipeline_load_failed = True
        return None


def warm_up() -> None:
    """Load the pipeline ahead of the first request."""
    if not settings.use_mock_diarization:
        _get_pipeline()


def _normalize_speaker_labels(raw_segments: List[Tuple[str, float, float]]) -> List[SpeakerSegment]:
    """Map pyannote's raw labels (SPEAKER_00, SPEAKER_01, ...) to friendly, stable
    'Speaker 1' / 'Speaker 2' labels ordered by first appearance."""
    label_order: List[str] = []
    for raw_label, _, _ in raw_segments:
        if raw_label not in label_order:
            label_order.append(raw_label)

    label_map = {raw: f"Speaker {i + 1}" for i, raw in enumerate(label_order)}

    return [
        SpeakerSegment(speaker=label_map[raw_label], start=round(start, 3), end=round(end, 3))
        for raw_label, start, end in raw_segments
        if end > start
    ]


def run_pyannote_diarization(audio: np.ndarray) -> Optional[List[SpeakerSegment]]:
    """Run pyannote.audio on 16 kHz mono audio (decoded once by the caller with
    PyAV, since torchaudio can't read mp3/m4a on Windows without FFmpeg).
    Returns None if the pipeline is unavailable or fails, so callers can fall back to mock."""
    pipeline = _get_pipeline()
    if pipeline is None:
        return None

    try:
        import torch

        waveform = torch.from_numpy(np.ascontiguousarray(audio)).unsqueeze(0)
        diarization = pipeline({"waveform": waveform, "sample_rate": SAMPLE_RATE})
    except Exception:
        logger.exception("pyannote.audio diarization failed; using mock data.")
        return None

    raw_segments: List[Tuple[str, float, float]] = [
        (speaker, turn.start, turn.end)
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]

    if not raw_segments:
        return None

    return _normalize_speaker_labels(raw_segments)


def generate_mock_segments(
    duration_seconds: Optional[float] = None,
    seed: Optional[int] = None,
) -> List[SpeakerSegment]:
    """Generate a plausible two-speaker conversation with alternating turns, natural
    response latencies, and a handful of overlaps/interruptions, for local testing
    without pyannote.audio or a HuggingFace token.
    """
    rng = random.Random(seed)
    target_duration = duration_seconds if duration_seconds and duration_seconds > 1 else rng.uniform(60, 180)

    segments: List[SpeakerSegment] = []
    speakers = ["Speaker 1", "Speaker 2"]
    current_speaker_index = rng.randint(0, 1)
    cursor = rng.uniform(0.0, 1.0)

    while cursor < target_duration:
        speaker = speakers[current_speaker_index]
        turn_length = rng.uniform(1.5, 8.0)
        start = cursor
        end = min(start + turn_length, target_duration)
        if end - start < 0.2:
            break

        segments.append(SpeakerSegment(speaker=speaker, start=round(start, 3), end=round(end, 3)))

        roll = rng.random()
        if roll < 0.15:
            # Overlap / interruption: the other speaker jumps in before this turn ends.
            overlap_lead = rng.uniform(0.3, min(2.5, turn_length * 0.6))
            next_start = max(0.0, end - overlap_lead)
            gap_or_overlap = next_start - end  # negative => overlap
        elif roll < 0.35:
            # Instant response, near-zero latency.
            gap_or_overlap = rng.uniform(0.0, 0.15)
            next_start = end + gap_or_overlap
        else:
            # Normal response latency.
            gap_or_overlap = rng.uniform(0.2, 2.2)
            next_start = end + gap_or_overlap

        cursor = next_start
        current_speaker_index = 1 - current_speaker_index

    if not segments:
        segments = [
            SpeakerSegment(speaker="Speaker 1", start=0.0, end=2.0),
            SpeakerSegment(speaker="Speaker 2", start=2.5, end=4.5),
        ]

    return segments


def diarize_audio(audio: np.ndarray) -> Tuple[List[SpeakerSegment], str]:
    """Main entry point used by the API layer: produce speaker segments for 16 kHz
    mono audio, returning (segments, source) where source is 'pyannote' or 'mock'."""
    if not settings.use_mock_diarization:
        segments = run_pyannote_diarization(audio)
        if segments:
            return segments, "pyannote"

    return generate_mock_segments(duration_seconds=len(audio) / SAMPLE_RATE), "mock"
