"""Environment configuration for the Conversation Timing Analyzer backend."""

from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # HuggingFace / pyannote.audio
    huggingface_token: str = ""
    diarization_model: str = "pyannote/speaker-diarization-3.1"

    # When true, always use the synthetic mock diarization generator instead of
    # attempting to load pyannote.audio. Useful for local development without a
    # GPU or a HuggingFace access token.
    use_mock_diarization: bool = False

    # Hop between pyannote's 10 s analysis windows. pyannote's default (1 s) recomputes
    # every moment ~10x; 2.5 s measured 2.6x faster on CPU with identical accuracy.
    diarization_step_seconds: float = 2.5

    # Speech-to-text (faster-whisper). Model sizes: tiny, base, small, medium, large-v3.
    # "small" identifies languages far more reliably than "base" (especially Urdu, Hindi,
    # Arabic) and still finishes before diarization, which runs in parallel.
    whisper_model: str = "small"
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"
    whisper_beam_size: int = 1
    # Number of 30 s speech windows, spread across the recording, averaged to decide the language.
    language_detection_segments: int = 6

    # Emotion detection. "audio" classifies each line's voice with a wav2vec2 speech-emotion
    # model (~1.3 GB download on first use), calibrated per recording and, for English,
    # combined with a RoBERTa GoEmotions model on the words; "text" uses only the words.
    # If the audio model can't load, the text model is used as a fallback.
    enable_emotions: bool = True
    emotion_source: str = "audio"
    audio_emotion_model: str = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"
    # int8 dynamic quantisation of the audio model: ~1.5x faster on CPU.
    audio_emotion_quantize: bool = True

    # Load every model at server start so the first upload doesn't wait for them.
    preload_models: bool = True

    # TrueType font for PDF reports (needs to cover the transcript's script). Empty = auto.
    pdf_font_path: str = ""

    # CORS
    allowed_origins: List[str] = ["http://localhost:3000"]

    # File handling
    data_dir: Path = BACKEND_DIR / "data"
    max_upload_size_mb: int = 200
    allowed_extensions: List[str] = [
        ".wav", ".mp3", ".m4a", ".flac", ".ogg", ".mpeg", ".mpg", ".mpga", ".mp2"
    ]

    # Interruption heuristic
    floor_transfer_threshold_seconds: float = 0.5

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
