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


class TranscriptSegment(BaseModel):
    """A span of transcribed speech, optionally attributed to a diarized speaker."""

    speaker: Optional[str] = Field(None, description="Speaker label once diarization has been matched")
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    text: str
    emotion: Optional[str] = Field(None, description="Dominant emotion family for this line, if analysed")
    emotion_confidence: Optional[float] = None
    emotion_scores: Optional[Dict[str, float]] = Field(None, description="Probability per emotion family")


class LanguageGuess(BaseModel):
    code: str
    probability: float


class Transcript(BaseModel):
    """Result of the speech-to-text stage."""

    segments: List[TranscriptSegment]
    language: Optional[str] = None
    language_probability: Optional[float] = Field(None, description="Whisper's confidence; None when the user chose the language")
    language_source: Literal["detected", "selected"] = "detected"
    language_alternatives: List[LanguageGuess] = []
    model: str
    word_count: int = 0


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
    """Per-speaker overview, including a name detected from the conversation if any."""

    speaker: str = Field(..., description="Diarization label, e.g. 'Speaker 1'")
    display_name: str = Field(..., description="Detected name, or the diarization label")
    detected_name: Optional[str] = None
    name_evidence: Optional[str] = Field(None, description="Transcript line the name came from")
    talk_time: float
    talk_share: float
    turns: int
    words: int
    words_per_minute: float


class EmotionScore(BaseModel):
    emotion: str
    score: float


class SpeakerEmotionSummary(BaseModel):
    speaker: str
    dominant: str
    distribution: List[EmotionScore]
    line_counts: Dict[str, int]


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

    diarization_source: Literal["pyannote", "mock"] = "mock"

    transcript: Optional[Transcript] = None

    speaker_profiles: List[SpeakerProfile] = []
    emotions: Optional[List[SpeakerEmotionSummary]] = None
    emotion_source: Optional[Literal["combined", "audio", "text"]] = Field(
        None, description="Voice and words combined, voice-tone model only, or words model only"
    )

    timings: Dict[str, float] = Field(default_factory=dict, description="Seconds spent per pipeline stage")
