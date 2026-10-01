"""Speaker diarization: turns an audio file into a list of SpeakerSegment timestamps.

Uses pyannote.audio's pretrained pipeline (`pyannote/speaker-diarization-3.1`). If it
can't be loaded or run, analysis fails with DiarizationUnavailable rather than reporting
made-up numbers. The synthetic mock generator is only used when USE_MOCK_DIARIZATION is
set, for developing without a GPU or gated model access.
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


class DiarizationUnavailable(RuntimeError):
    """The pyannote pipeline couldn't be loaded or failed while running."""


def _try_import_pyannote():
    try:
        from pyannote.audio import Pipeline  # type: ignore

        return Pipeline
    except ImportError:
        return None


class _SkipSilentSpeakers:
    """Wraps pyannote's speaker-embedding model so it only runs on speakers who talk.

    pyannote extracts an embedding for each of its 3 local speaker slots in every analysis
    window, but in a typical conversation about two thirds of those slots are silent (an
    all-zero mask). Their embeddings are never used: clustering keeps only active speakers
    and the pipeline then marks inactive ones as unassigned. Skipping them (returning NaN,
    pyannote's own "no embedding" value) gives the same diarization ~3x faster.
    """

    def __init__(self, model):
        self._model = model

    def __getattr__(self, name):
        return getattr(self._model, name)

    def __call__(self, waveforms, masks=None):
        if masks is None:
            return self._model(waveforms)
        active = (masks > 0).any(dim=1)
        if active.all():
            return self._model(waveforms, masks=masks)
        if not active.any():
            return np.full((len(waveforms), self._model.dimension), np.nan)
        computed = self._model(waveforms[active], masks=masks[active])
        embeddings = np.full((len(waveforms), computed.shape[1]), np.nan, dtype=computed.dtype)
        embeddings[active.numpy()] = computed
        return embeddings


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
        logger.warning("pyannote.audio is not installed; diarization is unavailable.")
        _pipeline_load_failed = True
        return None

    if not settings.huggingface_token:
        logger.warning(
            "No HUGGINGFACE_TOKEN configured; diarization is unavailable. "
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
        if getattr(_pipeline, "_embedding", None) is not None:
            _pipeline._embedding = _SkipSilentSpeakers(_pipeline._embedding)
        return _pipeline
    except Exception:
        logger.exception(
            "Failed to load pyannote.audio pipeline '%s'.",
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


def run_pyannote_diarization(audio: np.ndarray) -> List[SpeakerSegment]:
    """Run pyannote.audio on 16 kHz mono audio (decoded once by the caller with
    PyAV, since torchaudio can't read mp3/m4a on Windows without FFmpeg).
    Returns an empty list when no speech is found; raises DiarizationUnavailable if the
    pipeline can't be loaded or fails."""
    pipeline = _get_pipeline()
    if pipeline is None:
        raise DiarizationUnavailable("The speaker diarization model could not be loaded.")

    try:
        import torch

        waveform = torch.from_numpy(np.ascontiguousarray(audio)).unsqueeze(0)
        diarization = pipeline({"waveform": waveform, "sample_rate": SAMPLE_RATE})
    except Exception as exc:
        logger.exception("pyannote.audio diarization failed.")
        raise DiarizationUnavailable("Speaker diarization failed while processing the recording.") from exc

    raw_segments: List[Tuple[str, float, float]] = [
        (speaker, turn.start, turn.end)
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]

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
    mono audio, returning (segments, source) where source is 'pyannote' or 'mock'.
    The segment list is empty when the recording contains no detectable speech."""
    if settings.use_mock_diarization:
        # Seeded by length so the same file always gets the same synthetic conversation.
        return generate_mock_segments(duration_seconds=len(audio) / SAMPLE_RATE, seed=len(audio)), "mock"

    return run_pyannote_diarization(audio), "pyannote"
