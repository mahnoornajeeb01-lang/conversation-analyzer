"""Pydantic v2 data models shared across the diarization and analysis services."""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

InterruptionClassification = Literal[
    "Successful Interruption (Floor Transfer)",
    "Competitive Overlap / Backchannel",
    "Brief Overlap",
]


class SpeakerSegment(BaseModel):
    """A single continuous span of speech attributed to one speaker."""

    model_config = ConfigDict(from_attributes=True)

    speaker: str = Field(..., description="Speaker label, e.g. 'Speaker 1'")
    start: float = Field(..., ge=0, description="Segment start time in seconds")
    end: float = Field(..., ge=0, description="Segment end time in seconds")

    @model_validator(mode="after")
    def _check_end_after_start(self) -> "SpeakerSegment":
        if self.end <= self.start:
            raise ValueError(
                f"Segment end ({self.end}) must be greater than start ({self.start})"
            )
        return self

    @property
    def duration(self) -> float:
        return round(self.end - self.start, 6)


class LatencyEvent(BaseModel):
    """A gap in speech between two different speakers taking consecutive turns."""

    previous_speaker: str
    next_speaker: str
    previous_end: float
    next_start: float
    latency_seconds: float = Field(..., ge=0)


class LatencyStats(BaseModel):
    """Aggregate statistics computed over all detected latency events."""

    average: float = 0.0
    median: float = 0.0
    minimum: float = 0.0
    maximum: float = 0.0
    total_turns_analyzed: int = 0


class OverlapEvent(BaseModel):
    """A period of time during which two different speakers were speaking at once."""

    speaker_a: str
    speaker_b: str
    start: float
    end: float
    duration: float = Field(..., gt=0)

    @field_validator("duration")
    @classmethod
    def _round_duration(cls, v: float) -> float:
        return round(v, 6)


class InterruptionEvent(BaseModel):
    """Classification of an overlap as an interruption or conversational support."""

    interrupter: str = Field(..., description="Speaker who started talking over the other")
    interrupted: str = Field(..., description="Speaker who was talking first")
    overlap_start: float
    overlap_end: float
    overlap_duration: float
    time_to_yield: float = Field(
        ..., description="Seconds between the interrupter starting and the interrupted speaker stopping"
    )
    classification: InterruptionClassification
    timestamp: float = Field(
        ..., description="Playback timestamp (seconds) to seek to for this event, equal to overlap_start"
    )


class SpeakerProfile(BaseModel):
    """Per-speaker share of the conversation."""

    speaker: str = Field(..., description="Diarization label, e.g. 'Speaker 1'")
    talk_time: float
    talk_share: float
    turns: int


class TranscriptSegment(BaseModel):
    """One utterance: consecutive words from the same speaker."""

    speaker: Optional[str] = Field(None, description="Diarization label of who said it")
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    text: str


class LanguageShare(BaseModel):
    """One language heard in the recording."""

    code: str = Field(..., description="ISO 639-1 code, e.g. 'fr'")
    name: str
    share: float = Field(..., ge=0, le=1, description="Estimated fraction of the speech in this language")


class Transcript(BaseModel):
    """What was said, with the detected spoken language."""

    language: str = Field(..., description="ISO 639-1 code detected by Whisper, e.g. 'en' or 'ur'; empty when not reported")
    language_name: str
    language_probability: Optional[float] = Field(None, ge=0, le=1, description="None when the engine doesn't report it")
    right_to_left: bool = False
    languages: List[LanguageShare] = Field(
        default_factory=list,
        description="Every language heard across the whole recording, most spoken first; more than one means mixed-language audio",
    )
    segments: List[TranscriptSegment]
    word_count: int = 0
    model: str = ""


class AnalysisReport(BaseModel):
    """The complete structured result returned by POST /api/analyze."""

    filename: str
    total_duration: float
    speakers: List[str]
    speaker_count: int
    segments: List[SpeakerSegment]

    latencies: List[LatencyEvent]
    latency_stats: LatencyStats

    overlaps: List[OverlapEvent]
    overlap_count: int

    interruptions: List[InterruptionEvent]
    interruption_count: int
    successful_interruption_count: int
    backchannel_count: int

    diarization_source: Literal["pyannote", "pyannoteai", "mock"] = "mock"

    speaker_profiles: List[SpeakerProfile] = []

    transcript: Optional[Transcript] = None
    transcript_error: Optional[str] = Field(None, description="Why there is no transcript, when it failed")

    timings: Dict[str, float] = Field(default_factory=dict, description="Seconds spent per pipeline stage")
