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

    # Speech-to-text (faster-whisper). Model sizes: tiny, base, small, medium, large-v3;
    # larger is more accurate (especially for Urdu and other non-English speech) but
    # slower on CPU. Downloaded once into whisper_cache_dir.
    transcription_enabled: bool = True
    whisper_model: str = "small"
    whisper_compute_type: str = "int8"
    whisper_beam_size: int = 5
    whisper_cache_dir: Path = BACKEND_DIR / "models"

    # Where the speech work runs: "local" (the models above, on this machine) or
    # "pyannoteai" (pyannoteAI's hosted API does diarization and speech-to-text, so the
    # server needs no ML libraries and fits a small host such as Render's free tier).
    analysis_engine: str = "local"
    pyannoteai_api_key: str = ""
    pyannoteai_model: str = "precision-2"
    # Whisper large-v3-turbo is multilingual (incl. Urdu); the API's default, Parakeet,
    # covers 25 European languages.
    pyannoteai_transcription_model: str = "faster-whisper-large-v3-turbo"

    # Load the models at server start so the first upload doesn't wait for them.
    preload_models: bool = True

    # TrueType font for PDF reports. Empty = auto.
    pdf_font_path: str = ""

    # CORS
    allowed_origins: List[str] = ["http://localhost:3000"]
    # The dashboard on Vercel: its production aliases and every deployment URL of this project.
    allowed_origin_regex: str = (
        r"https://conversation-analyzer-(iota-umber|mahnoornajeeb01-2303|[a-z0-9]+-mahnoornajeeb01-2303)\.vercel\.app"
    )

    # The dashboard's static build (`npm run build` in frontend/). When present it is
    # served at "/", so one address (e.g. a Cloudflare tunnel) gives the whole app.
    frontend_dir: Path = BACKEND_DIR.parent / "frontend" / "out"

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
