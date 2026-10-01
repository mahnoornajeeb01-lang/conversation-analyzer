"""Speech-to-text: what each speaker said, and which language it was in.

Uses faster-whisper (Whisper on CTranslate2, int8 on CPU). Whisper detects the spoken
language and gives word timestamps; each word is then attributed to whichever diarized
speaker was talking at that moment, and consecutive words from one speaker are joined
into an utterance.
"""

from __future__ import annotations

import logging
import threading
from typing import List, Optional, Sequence

import numpy as np

from app.core.config import settings
from app.models.schema import SpeakerSegment, Transcript, TranscriptSegment

logger = logging.getLogger("conversation_analyzer.transcription")

SAMPLE_RATE = 16000

# A silence this long inside one speaker's speech starts a new utterance, and so does
# the end of a sentence once an utterance runs this long (keeps monologues readable).
UTTERANCE_GAP_SECONDS = 1.5
UTTERANCE_MAX_SECONDS = 20.0
SENTENCE_END = (".", "?", "!", "۔", "؟", "。", "？", "！")  # incl. Urdu/Arabic and CJK

_model = None
_model_load_failed = False
_model_lock = threading.Lock()

# Whisper's languages (faster_whisper only ships the codes).
LANGUAGE_NAMES = {
    "af": "Afrikaans", "am": "Amharic", "ar": "Arabic", "as": "Assamese", "az": "Azerbaijani",
    "ba": "Bashkir", "be": "Belarusian", "bg": "Bulgarian", "bn": "Bengali", "bo": "Tibetan",
    "br": "Breton", "bs": "Bosnian", "ca": "Catalan", "cs": "Czech", "cy": "Welsh", "da": "Danish",
    "de": "German", "el": "Greek", "en": "English", "es": "Spanish", "et": "Estonian", "eu": "Basque",
    "fa": "Persian", "fi": "Finnish", "fo": "Faroese", "fr": "French", "gl": "Galician",
    "gu": "Gujarati", "ha": "Hausa", "haw": "Hawaiian", "he": "Hebrew", "hi": "Hindi",
    "hr": "Croatian", "ht": "Haitian Creole", "hu": "Hungarian", "hy": "Armenian", "id": "Indonesian",
    "is": "Icelandic", "it": "Italian", "ja": "Japanese", "jw": "Javanese", "ka": "Georgian",
    "kk": "Kazakh", "km": "Khmer", "kn": "Kannada", "ko": "Korean", "la": "Latin",
    "lb": "Luxembourgish", "ln": "Lingala", "lo": "Lao", "lt": "Lithuanian", "lv": "Latvian",
    "mg": "Malagasy", "mi": "Maori", "mk": "Macedonian", "ml": "Malayalam", "mn": "Mongolian",
    "mr": "Marathi", "ms": "Malay", "mt": "Maltese", "my": "Myanmar", "ne": "Nepali", "nl": "Dutch",
    "nn": "Norwegian Nynorsk", "no": "Norwegian", "oc": "Occitan", "pa": "Punjabi", "pl": "Polish",
    "ps": "Pashto", "pt": "Portuguese", "ro": "Romanian", "ru": "Russian", "sa": "Sanskrit",
    "sd": "Sindhi", "si": "Sinhala", "sk": "Slovak", "sl": "Slovenian", "sn": "Shona", "so": "Somali",
    "sq": "Albanian", "sr": "Serbian", "su": "Sundanese", "sv": "Swedish", "sw": "Swahili",
    "ta": "Tamil", "te": "Telugu", "tg": "Tajik", "th": "Thai", "tk": "Turkmen", "tl": "Tagalog",
    "tr": "Turkish", "tt": "Tatar", "uk": "Ukrainian", "ur": "Urdu", "uz": "Uzbek",
    "vi": "Vietnamese", "yi": "Yiddish", "yo": "Yoruba", "yue": "Cantonese", "zh": "Chinese",
}

RTL_LANGUAGES = {"ar", "fa", "he", "ps", "sd", "ur", "yi"}


class TranscriptionUnavailable(RuntimeError):
    """The speech-to-text model couldn't be loaded or failed while running."""


def _get_model():
    """Lazily load and cache the Whisper model (downloaded on first use)."""
    global _model, _model_load_failed
    with _model_lock:
        if _model is not None or _model_load_failed:
            return _model
        try:
            from faster_whisper import WhisperModel

            _model = WhisperModel(
                settings.whisper_model,
                device="cpu",
                compute_type=settings.whisper_compute_type,
                download_root=str(settings.whisper_cache_dir),
            )
            logger.info("Loaded Whisper model '%s'.", settings.whisper_model)
        except Exception:
            logger.exception("Failed to load Whisper model '%s'.", settings.whisper_model)
            _model_load_failed = True
        return _model


def warm_up() -> None:
    if settings.transcription_enabled:
        _get_model()


def _speaker_at(start: float, end: float, segments: Sequence[SpeakerSegment]) -> Optional[str]:
    """The speaker who overlaps [start, end] the most, else the nearest one in time."""
    best, best_overlap = None, 0.0
    for seg in segments:
        overlap = min(end, seg.end) - max(start, seg.start)
        if overlap > best_overlap:
            best, best_overlap = seg.speaker, overlap
    if best is not None:
        return best
    mid = (start + end) / 2
    nearest = min(segments, key=lambda s: min(abs(mid - s.start), abs(mid - s.end)), default=None)
    return nearest.speaker if nearest else None


def _group_words(words: List[tuple], speaker_segments: Sequence[SpeakerSegment]) -> List[TranscriptSegment]:
    utterances: List[TranscriptSegment] = []
    current: Optional[dict] = None
    for start, end, text in words:
        speaker = _speaker_at(start, end, speaker_segments)
        sentence_done = (
            current is not None
            and current["end"] - current["start"] >= UTTERANCE_MAX_SECONDS
            and current["text"].rstrip().endswith(SENTENCE_END)
        )
        if (
            current
            and current["speaker"] == speaker
            and start - current["end"] <= UTTERANCE_GAP_SECONDS
            and not sentence_done
        ):
            current["end"] = end
            current["text"] += text
            continue
        if current:
            utterances.append(current)
        current = {"speaker": speaker, "start": start, "end": end, "text": text}
    if current:
        utterances.append(current)
    return [
        TranscriptSegment(
            speaker=u["speaker"],
            start=round(u["start"], 2),
            end=round(max(u["end"], u["start"] + 0.01), 2),
            text=u["text"].strip(),
        )
        for u in utterances
        if u["text"].strip()
    ]


def transcribe(audio: np.ndarray, speaker_segments: Sequence[SpeakerSegment]) -> Transcript:
    """Transcribe 16 kHz mono audio and attribute the text to the diarized speakers."""
    model = _get_model()
    if model is None:
        raise TranscriptionUnavailable("The speech-to-text model could not be loaded.")
    try:
        segments, info = model.transcribe(
            audio,
            beam_size=settings.whisper_beam_size,
            word_timestamps=True,
            vad_filter=True,
            # Stops Whisper repeating one phrase over and over on long recordings.
            condition_on_previous_text=False,
        )
        words: List[tuple] = []
        for segment in segments:  # a generator: the decoding happens here
            if segment.words:
                words += [(w.start, w.end, w.word) for w in segment.words]
            elif segment.text.strip():
                words.append((segment.start, segment.end, " " + segment.text.strip()))
    except Exception as exc:
        logger.exception("Whisper transcription failed.")
        raise TranscriptionUnavailable("Speech-to-text failed while processing the recording.") from exc

    utterances = _group_words(words, speaker_segments)
    return Transcript(
        language=info.language,
        language_name=LANGUAGE_NAMES.get(info.language, info.language),
        language_probability=round(float(info.language_probability), 3),
        right_to_left=info.language in RTL_LANGUAGES,
        segments=utterances,
        word_count=sum(len(u.text.split()) for u in utterances),
        model=f"whisper-{settings.whisper_model}",
    )
