"""Conversation insights derived from the speaker-labelled transcript:

* speaker names mentioned in the conversation ("my name is Sarah", "Hi John, ..."),
* per-line and per-speaker emotions: from the voice (wav2vec2 speech-emotion model, see
  voice_emotion.py) or, as a fallback, from the words (RoBERTa GoEmotions via onnxruntime).

Both are best-effort: if a name can't be found the speaker keeps its "Speaker N" label,
and if the emotion model can't be loaded the report simply carries no emotion data.
"""

from __future__ import annotations

import logging
import re
import threading
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.core.config import settings
from app.services import voice_emotion
from app.models.schema import (
    EmotionScore,
    SpeakerEmotionSummary,
    SpeakerProfile,
    SpeakerSegment,
    TranscriptSegment,
)

logger = logging.getLogger("conversation_analyzer.insights")

# --------------------------------------------------------------------------------------
# Speaker names
# --------------------------------------------------------------------------------------

# Capitalised words that commonly follow the trigger phrases but are not names.
_NOT_NAMES = {
    "I", "I'm", "Im", "Okay", "Ok", "Yes", "Yeah", "No", "Sure", "Right", "Well", "So", "Oh",
    "Hi", "Hello", "Hey", "Thanks", "Thank", "Good", "Great", "Fine", "Sorry", "Please",
    "Morning", "Afternoon", "Evening", "Night", "Everyone", "Everybody", "Guys", "All", "Team",
    "Sir", "Madam", "Maam", "Mr", "Mrs", "Ms", "Dr", "Doctor", "The", "A", "An", "This", "That",
    "It", "We", "You", "He", "She", "They", "My", "Your", "Our", "Just", "Really", "Actually",
    "Here", "There", "What", "Why", "How", "When", "Where", "Who", "And", "But", "Or", "Not",
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    "January", "February", "March", "April", "May", "June", "July", "August", "September",
    "October", "November", "December", "English", "God", "Bye", "Goodbye", "Welcome", "Dear",
    "Absolutely", "Definitely", "Exactly", "Perfect", "Cool", "Nice", "Alright", "Anyway",
    "Honestly", "Seriously", "Basically", "Obviously", "Frankly", "Personally", "Luckily",
    "Unfortunately", "Anyways", "Wow", "Look", "Listen", "Now", "Then", "Also", "Plus",
}

_NAME = r"([A-Z][a-z]{1,20}(?:\s[A-Z][a-z]{1,20})?)"

# The speaker is naming themselves.
_SELF_PATTERNS = [
    re.compile(rf"\bmy name(?:'s| is)\s+{_NAME}"),
    re.compile(rf"\b(?:this is|it's|it is)\s+{_NAME}\s+(?:here|speaking|from|calling)\b"),
    re.compile(rf"\b(?:I'm|I am)\s+{_NAME}\s*(?:,|\.|from|and|here|speaking|calling)"),
    re.compile(rf"\bcall me\s+{_NAME}"),
    re.compile(rf"^(?i:hi|hello|hey)[,!.]?\s+(?:this is|it's)\s+{_NAME}"),
]

# The speaker is addressing someone else by name.
_ADDRESS_PATTERNS = [
    # Only the greeting is case-insensitive; the name itself must be capitalised.
    re.compile(
        rf"\b(?i:hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening|morning|"
        rf"bye|goodbye|see you|sorry|welcome|dear|yes|no|okay|well|right|sure)[,!]?\s+{_NAME}\b[,.!?]",
    ),
    re.compile(rf",\s*{_NAME}\s*[.?!]"),  # "... how are you, Sarah?"
    re.compile(rf"(?:^|[.?!]\s+){_NAME},\s+(?:can|could|would|will|do|did|are|is|have|what|how|why|when|where|I|you|we|let)\b"),
]


def _clean_name(raw: str) -> Optional[str]:
    parts = [p for p in raw.split() if p not in _NOT_NAMES]
    if not parts or parts[0] != raw.split()[0]:
        return None
    return " ".join(parts)


def detect_speaker_names(
    segments: List[TranscriptSegment], speakers: List[str]
) -> Dict[str, Tuple[str, str]]:
    """Return {speaker_label: (name, evidence)} for speakers whose name was mentioned.

    Self-introductions count strongly for the speaker saying them; a name used to
    address someone counts for the next (or previous) different speaker.
    """
    votes: Dict[str, Counter] = defaultdict(Counter)
    evidence: Dict[Tuple[str, str], str] = {}

    labelled = [s for s in segments if s.speaker]
    for i, seg in enumerate(labelled):
        text = seg.text.strip()

        for pattern in _SELF_PATTERNS:
            for match in pattern.finditer(text):
                name = _clean_name(match.group(1))
                if name:
                    votes[seg.speaker][name] += 3
                    evidence.setdefault((seg.speaker, name), f"introduced themselves: “{text}”")

        addressee = next((s.speaker for s in labelled[i + 1:] if s.speaker != seg.speaker), None)
        if addressee is None:
            addressee = next((s.speaker for s in reversed(labelled[:i]) if s.speaker != seg.speaker), None)
        if addressee is None:
            continue
        for pattern in _ADDRESS_PATTERNS:
            for match in pattern.finditer(text):
                name = _clean_name(match.group(1))
                if name:
                    votes[addressee][name] += 1
                    evidence.setdefault((addressee, name), f"addressed by name: “{text}”")

    # Greedy assignment by strongest evidence, so two speakers never share a name.
    candidates = sorted(
        ((count, speaker, name) for speaker, c in votes.items() for name, count in c.items()),
        reverse=True,
    )
    result: Dict[str, Tuple[str, str]] = {}
    used: set[str] = set()
    for _, speaker, name in candidates:
        if speaker in result or name in used or speaker not in speakers:
            continue
        result[speaker] = (name, evidence[(speaker, name)])
        used.add(name)
    return result


def build_speaker_profiles(
    speakers: List[str],
    speaker_segments: List[SpeakerSegment],
    transcript: List[TranscriptSegment],
) -> List[SpeakerProfile]:
    names = detect_speaker_names(transcript, speakers)
    total_talk = sum(s.end - s.start for s in speaker_segments) or 1.0

    profiles: List[SpeakerProfile] = []
    for speaker in speakers:
        own = [s for s in speaker_segments if s.speaker == speaker]
        talk = sum(s.end - s.start for s in own)
        lines = [s for s in transcript if s.speaker == speaker]
        words = sum(len(s.text.split()) for s in lines)
        name, why = names.get(speaker, (None, None))
        profiles.append(
            SpeakerProfile(
                speaker=speaker,
                display_name=name or speaker,
                detected_name=name,
                name_evidence=why,
                talk_time=round(talk, 3),
                talk_share=round(talk / total_talk, 4),
                turns=len(own),
                words=words,
                words_per_minute=round(words / (talk / 60), 1) if talk > 0 else 0.0,
            )
        )
    return profiles


# --------------------------------------------------------------------------------------
# Emotions
# --------------------------------------------------------------------------------------

EMOTION_REPO = "SamLowe/roberta-base-go_emotions-onnx"

# GoEmotions' 28 labels folded into six families shown in the dashboard.
EMOTION_FAMILIES = ["joy", "surprise", "neutral", "sadness", "fear", "anger"]
_GO_TO_FAMILY = {
    "admiration": "joy", "amusement": "joy", "approval": "joy", "caring": "joy",
    "desire": "joy", "excitement": "joy", "gratitude": "joy", "joy": "joy", "love": "joy",
    "optimism": "joy", "pride": "joy", "relief": "joy",
    "surprise": "surprise", "realization": "surprise", "curiosity": "surprise",
    "confusion": "surprise",
    "sadness": "sadness", "disappointment": "sadness", "grief": "sadness", "remorse": "sadness",
    "embarrassment": "sadness",
    "fear": "fear", "nervousness": "fear",
    "anger": "anger", "annoyance": "anger", "disapproval": "anger", "disgust": "anger",
    "neutral": "neutral",
}

_emotion_model = None
_emotion_load_failed = False
_text_lock = threading.Lock()


class _EmotionModel:
    def __init__(self) -> None:
        import json

        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        from tokenizers import Tokenizer

        model_path = hf_hub_download(EMOTION_REPO, "onnx/model_quantized.onnx")
        tokenizer_path = hf_hub_download(EMOTION_REPO, "onnx/tokenizer.json")
        config_path = hf_hub_download(EMOTION_REPO, "onnx/config.json")

        with open(config_path, encoding="utf-8") as fh:
            id2label = json.load(fh)["id2label"]
        self.labels = [id2label[str(i)] for i in range(len(id2label))]

        self.tokenizer = Tokenizer.from_file(tokenizer_path)
        self.tokenizer.enable_truncation(max_length=256)
        self.tokenizer.enable_padding(pad_id=1, pad_token="<pad>")
        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.input_names = {i.name for i in self.session.get_inputs()}

    def family_scores(self, texts: List[str]) -> List[Dict[str, float]]:
        """Score each text; returns a normalised distribution over EMOTION_FAMILIES."""
        results: List[Dict[str, float]] = []
        for start in range(0, len(texts), 16):
            batch = self.tokenizer.encode_batch(texts[start:start + 16])
            feeds = {
                "input_ids": np.array([e.ids for e in batch], dtype=np.int64),
                "attention_mask": np.array([e.attention_mask for e in batch], dtype=np.int64),
            }
            feeds = {k: v for k, v in feeds.items() if k in self.input_names}
            logits = self.session.run(None, feeds)[0]
            probs = 1.0 / (1.0 + np.exp(-logits))  # GoEmotions is multi-label
            for row in probs:
                family = {f: 0.0 for f in EMOTION_FAMILIES}
                for label, p in zip(self.labels, row):
                    fam = _GO_TO_FAMILY.get(label)
                    if fam:
                        family[fam] = max(family[fam], float(p))
                total = sum(family.values()) or 1.0
                results.append({f: v / total for f, v in family.items()})
        return results


def _get_emotion_model() -> Optional[_EmotionModel]:
    global _emotion_model, _emotion_load_failed
    with _text_lock:
        if _emotion_model is not None or _emotion_load_failed or not settings.enable_emotions:
            return _emotion_model
        try:
            logger.info("Loading text emotion model '%s'...", EMOTION_REPO)
            _emotion_model = _EmotionModel()
        except Exception:
            logger.exception("Could not load the text emotion model.")
            _emotion_load_failed = True
        return _emotion_model


def warm_up_emotions() -> None:
    """Load the emotion models ahead of the first request (the text model is always
    needed: it is fused with the voice model for English and is the voice fallback)."""
    if not settings.enable_emotions:
        return
    if settings.emotion_source == "audio":
        voice_emotion.available()
    _get_emotion_model()


# The text model understands English only; for English lines the words weigh more than
# the voice model, which is far less reliable on real (non-acted) recordings.
TEXT_LANGUAGES = {"en"}
TEXT_WEIGHT = 0.6
# A line is only labelled with an emotion when it clearly stands out; weak or split
# evidence stays "neutral", which is what most conversational speech is.
MIN_EMOTION_SCORE = 0.40
MIN_EMOTION_MARGIN = 0.10


def _label(dist: Dict[str, float]) -> str:
    ranked = sorted(dist, key=dist.get, reverse=True)  # type: ignore[arg-type]
    top = ranked[0]
    if top == "neutral":
        return top
    runner_up = dist[ranked[1]] if len(ranked) > 1 else 0.0
    if dist[top] < MIN_EMOTION_SCORE or dist[top] - runner_up < MIN_EMOTION_MARGIN:
        return "neutral"
    return top


def _fuse(
    voice: Optional[Dict[str, float]], text: Optional[Dict[str, float]]
) -> Optional[Dict[str, float]]:
    if voice is None or text is None:
        return voice or text
    return {f: TEXT_WEIGHT * text.get(f, 0.0) + (1 - TEXT_WEIGHT) * voice.get(f, 0.0) for f in EMOTION_FAMILIES}


def _apply_scores(
    transcript: List[TranscriptSegment], scores: List[Optional[Dict[str, float]]]
) -> List[TranscriptSegment]:
    tagged: List[TranscriptSegment] = []
    for seg, dist in zip(transcript, scores):
        if not dist:
            tagged.append(seg)
            continue
        top = _label(dist)
        confidence = dist[top]
        if top == "neutral":  # also covers lines where no emotion stood out clearly
            confidence = max(confidence, 1 - max(v for f, v in dist.items() if f != "neutral"))
        tagged.append(
            seg.model_copy(
                update={
                    "emotion": top,
                    "emotion_confidence": round(confidence, 3),
                    "emotion_scores": {f: round(dist.get(f, 0.0), 4) for f in EMOTION_FAMILIES},
                }
            )
        )
    return tagged


def _text_scores(transcript: List[TranscriptSegment]) -> Optional[List[Dict[str, float]]]:
    model = _get_emotion_model()
    if model is None:
        return None
    try:
        return model.family_scores([s.text for s in transcript])
    except Exception:
        logger.exception("Text emotion scoring failed.")
        return None


def tag_emotions(
    audio: np.ndarray, transcript: List[TranscriptSegment], language: Optional[str] = None
) -> Tuple[List[TranscriptSegment], Optional[str]]:
    """Attach an emotion distribution to every transcript line (no speakers needed).

    With `emotion_source == "audio"` the (calibrated) voice model scores how each line
    sounded; for English it is combined with the text model's reading of the words.
    Falls back to whichever model is available. Returns (lines, source) where source is
    "combined", "audio", "text", or None if nothing could run.
    """
    if not settings.enable_emotions or not transcript:
        return transcript, None

    voice: Optional[List[Optional[Dict[str, float]]]] = None
    if settings.emotion_source == "audio":
        try:
            voice = voice_emotion.score_lines(audio, [(s.start, s.end) for s in transcript])
        except Exception:
            logger.exception("Voice emotion scoring failed; falling back to the text model.")

    # Words are only trusted in a language the text model understands, unless there is
    # nothing else to go on.
    text: Optional[List[Dict[str, float]]] = None
    if (language or "en") in TEXT_LANGUAGES or voice is None:
        text = _text_scores(transcript)

    if voice is not None and text is not None:
        return _apply_scores(transcript, [_fuse(v, t) for v, t in zip(voice, text)]), "combined"
    if voice is not None:
        return _apply_scores(transcript, voice), "audio"
    if text is not None:
        return _apply_scores(transcript, text), "text"
    return transcript, None


def summarize_emotions(
    transcript: List[TranscriptSegment], speakers: List[str]
) -> Optional[List[SpeakerEmotionSummary]]:
    """Per-speaker emotion mix: the share of each speaker's talk time whose line was
    labelled with each emotion. Uses the per-line labels (not the raw scores) so lines
    where no emotion clearly stood out count as neutral here too."""
    weighted: Dict[str, Dict[str, float]] = {sp: {f: 0.0 for f in EMOTION_FAMILIES} for sp in speakers}
    line_counts: Dict[str, Counter] = {sp: Counter() for sp in speakers}
    any_scored = False

    for seg in transcript:
        if not seg.emotion or seg.speaker not in weighted:
            continue
        any_scored = True
        weighted[seg.speaker][seg.emotion] += max(seg.end - seg.start, 0.1)
        line_counts[seg.speaker][seg.emotion] += 1

    if not any_scored:
        return None

    summaries: List[SpeakerEmotionSummary] = []
    for speaker in speakers:
        totals = weighted[speaker]
        norm = sum(totals.values())
        if norm <= 0:
            continue
        distribution = [
            EmotionScore(emotion=f, score=round(totals[f] / norm, 4)) for f in EMOTION_FAMILIES
        ]
        dominant = max(distribution, key=lambda e: e.score).emotion
        # A speaker is only "neutral" overall if nothing else stands out.
        non_neutral = [e for e in distribution if e.emotion != "neutral"]
        strongest = max(non_neutral, key=lambda e: e.score)
        if dominant == "neutral" and strongest.score >= 0.30:
            dominant = strongest.emotion
        summaries.append(
            SpeakerEmotionSummary(
                speaker=speaker,
                dominant=dominant,
                distribution=distribution,
                line_counts=dict(line_counts[speaker]),
            )
        )
    return summaries
