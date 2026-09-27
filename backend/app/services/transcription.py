"""Speech-to-text: turns an audio file into timestamped transcript segments.

Uses faster-whisper (CTranslate2 build of OpenAI Whisper), which decodes audio itself
via PyAV so no system ffmpeg is required. The model is downloaded from the HuggingFace
hub on first use and cached, then loaded lazily and reused for later requests.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

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


SAMPLE_RATE = 16000
WINDOW_SAMPLES = 30 * SAMPLE_RATE  # Whisper's context
DECODE_SAMPLES = 20 * SAMPLE_RATE  # enough speech to compare two languages, half the cost
# When the runner-up's averaged probability is at least this close, both are decoded.
AMBIGUOUS_TOP = 0.75
AMBIGUOUS_RUNNER_UP = 0.10
# Pairs Whisper routinely confuses because the spoken languages are near-identical.
CONFUSABLE = [{"hi", "ur"}, {"hi", "pa"}, {"ur", "pa"}, {"ms", "id"}, {"no", "nn"}, {"sr", "hr"}, {"sr", "bs"}]


def _speech_windows(audio: np.ndarray) -> List[np.ndarray]:
    """Up to `language_detection_segments` 30 s windows of speech (silence removed),
    spread evenly across the whole recording rather than taken from the start."""
    from faster_whisper.vad import collect_chunks, get_speech_timestamps

    chunks, _ = collect_chunks(audio, get_speech_timestamps(audio))
    speech = np.concatenate(chunks) if chunks else audio
    if len(speech) < SAMPLE_RATE:  # VAD found almost nothing; don't discard the audio
        speech = audio

    windows = [speech[i:i + WINDOW_SAMPLES] for i in range(0, len(speech), WINDOW_SAMPLES)]
    if len(windows) > 1 and len(windows[-1]) < 5 * SAMPLE_RATE:
        windows.pop()  # a few trailing seconds say little and would only add noise
    wanted = max(1, settings.language_detection_segments)
    if len(windows) > wanted:
        windows = [windows[int(i)] for i in np.linspace(0, len(windows) - 1, wanted).round()]
    return windows


def _decode_score(model, window: np.ndarray, language: str) -> float:
    """How fluently Whisper decodes `window` as `language`: mean token log-probability,
    penalising repetitive output (e.g. 'बबबबब...'), which is what a wrong language produces."""
    segments, _ = model.transcribe(
        window,
        language=language,
        beam_size=1,
        vad_filter=False,
        condition_on_previous_text=False,
        without_timestamps=True,
        temperature=0.0,
    )
    total, weight = 0.0, 0.0
    for seg in segments:
        w = max(len(seg.text.strip()), 1)
        penalty = 1.0 if seg.compression_ratio > 2.4 else 0.0
        total += (seg.avg_logprob - penalty) * w
        weight += w
    return total / weight if weight else float("-inf")


def detect_language(model, audio: np.ndarray) -> Tuple[str, float, List[Tuple[str, float]]]:
    """Detect the spoken language over the whole recording.

    faster-whisper's own detection stops at the first 30 s window it is >50% sure about,
    so an English greeting or a noisy opening decides the language of an entire Urdu call.
    Instead, average Whisper's language distribution over windows sampled across the
    recording (weighted by how much speech each holds), and if two languages are close,
    decode a sample in each and keep the one Whisper actually transcribes better.
    """
    from faster_whisper.audio import pad_or_trim

    windows = _speech_windows(audio)
    per_window: List[Dict[str, float]] = []
    totals: Dict[str, float] = {}
    weight_sum = 0.0
    for window in windows:
        encoded = model.encode(pad_or_trim(model.feature_extractor(window)))
        probs = {token[2:-2]: prob for token, prob in model.model.detect_language(encoded)[0]}
        per_window.append(probs)
        w = len(window) / WINDOW_SAMPLES
        weight_sum += w
        for code, prob in probs.items():
            totals[code] = totals.get(code, 0.0) + prob * w
    ranked = sorted(((c, p / weight_sum) for c, p in totals.items()), key=lambda cp: cp[1], reverse=True)

    (top, top_p), (second, second_p) = ranked[0], ranked[1]
    ambiguous = (top_p < AMBIGUOUS_TOP and second_p >= AMBIGUOUS_RUNNER_UP) or (
        {top, second} in CONFUSABLE and second_p >= 0.05
    )
    if ambiguous:
        # Decode the (up to two) windows most typical of the two candidates, so e.g. an
        # English intro doesn't drown out the Urdu/Hindi comparison.
        typical = sorted(
            range(len(windows)),
            key=lambda i: (per_window[i].get(top, 0.0) + per_window[i].get(second, 0.0)) * len(windows[i]),
            reverse=True,
        )[:2]
        samples = [windows[i][:DECODE_SAMPLES] for i in typical]
        scores = {code: sum(_decode_score(model, s, code) for s in samples) for code in (top, second)}
        logger.info("Language ambiguous (%s %.2f vs %s %.2f); decode scores %s", top, top_p, second, second_p, scores)
        if scores[second] > scores[top]:
            ranked[0], ranked[1] = ranked[1], ranked[0]
    return ranked[0][0], ranked[0][1], ranked


def transcribe_audio(audio: np.ndarray, language: Optional[str] = None) -> TranscriptionResult:
    """Transcribe 16 kHz mono audio. Segments have no speaker yet; see `assign_speakers`.

    With `language=None` the language is detected across the whole recording (see
    `detect_language`). Passing a code (e.g. "ur") skips detection.
    """
    model = _get_model()
    selected = language or None
    ranked: List[Tuple[str, float]] = []
    probability: Optional[float] = None

    try:
        if selected is None:
            language, probability, ranked = detect_language(model, audio)
        raw_segments, info = model.transcribe(
            audio,
            language=language,
            beam_size=settings.whisper_beam_size,
            vad_filter=True,
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

    alternatives = [
        LanguageGuess(code=code, probability=round(float(prob), 3))
        for code, prob in ranked[1:4]
        if prob >= 0.02
    ]
    logger.info("Language: %s (p=%.2f, %s)", language, probability or 0, "selected" if selected else "detected")
    return TranscriptionResult(
        segments=segments,
        language=language,
        language_probability=None if selected else round(float(probability), 3),
        language_source="selected" if selected else "detected",
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
