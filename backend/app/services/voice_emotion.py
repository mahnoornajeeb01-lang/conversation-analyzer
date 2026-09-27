"""Speech emotion recognition from the voice itself (tone, pitch, energy), using
`ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` (wav2vec2-large-xlsr
fine-tuned on RAVDESS: angry, calm, disgust, fearful, happy, neutral, sad, surprised).

The checkpoint was trained with a custom classification head (mean-pooled hidden
states -> dense -> tanh -> output) whose weights are named `classifier.dense.*` and
`classifier.output.*`. `AutoModelForAudioClassification` does not recognise those
names and silently replaces the head with *random* weights, producing near-uniform
noise, so the head is rebuilt here and loaded from the checkpoint explicitly.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Dict, List, Optional

import numpy as np

from app.core.config import settings

logger = logging.getLogger("conversation_analyzer.voice_emotion")

SAMPLE_RATE = 16000
MIN_CLIP_SECONDS = 0.4
MAX_CLIP_SECONDS = 8.0  # longer lines are scored in chunks and averaged

# RAVDESS labels folded into the dashboard's six emotion families.
LABEL_TO_FAMILY = {
    "angry": "anger",
    "disgust": "anger",
    "calm": "neutral",
    "neutral": "neutral",
    "fearful": "fear",
    "happy": "joy",
    "sad": "sadness",
    "surprised": "surprise",
}

_model = None
_load_failed = False
_lock = threading.Lock()


class _VoiceEmotionModel:
    def __init__(self) -> None:
        import torch
        from huggingface_hub import hf_hub_download
        from safetensors.torch import load_file
        from torch import nn
        from transformers import AutoFeatureExtractor, Wav2Vec2Model
        from transformers import logging as hf_logging

        hf_logging.set_verbosity_error()  # the head mismatch warning is expected; handled below
        repo = settings.audio_emotion_model

        with open(hf_hub_download(repo, "config.json"), encoding="utf-8") as fh:
            config = json.load(fh)
        self.labels: List[str] = [config["id2label"][str(i)] for i in range(len(config["id2label"]))]
        hidden = int(config["hidden_size"])

        class Head(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.dense = nn.Linear(hidden, hidden)
                self.output = nn.Linear(hidden, len(config["id2label"]))

            def forward(self, x):
                return self.output(torch.tanh(self.dense(x)))

        weights = load_file(hf_hub_download(repo, "model.safetensors"))
        head_weights = {k[len("classifier."):]: v for k, v in weights.items() if k.startswith("classifier.")}
        if set(head_weights) != {"dense.weight", "dense.bias", "output.weight", "output.bias"}:
            raise RuntimeError(f"Unexpected classifier weights in {repo}: {sorted(head_weights)}")
        self.head = Head().eval()
        self.head.load_state_dict(head_weights)
        del weights

        self.extractor = AutoFeatureExtractor.from_pretrained(repo)
        backbone = Wav2Vec2Model.from_pretrained(repo).eval()
        if settings.audio_emotion_quantize:
            backbone = torch.quantization.quantize_dynamic(backbone, {nn.Linear}, dtype=torch.qint8)
        self.backbone = backbone
        self.torch = torch

    def probabilities(self, clip: np.ndarray) -> np.ndarray:
        inputs = self.extractor(clip, sampling_rate=SAMPLE_RATE, return_tensors="pt")
        with self.torch.inference_mode():
            hidden = self.backbone(inputs.input_values).last_hidden_state.mean(dim=1)
            return self.torch.softmax(self.head(hidden), dim=-1)[0].numpy()


def _get_model() -> Optional[_VoiceEmotionModel]:
    global _model, _load_failed
    with _lock:
        if _model is None and not _load_failed:
            try:
                logger.info("Loading voice emotion model '%s'...", settings.audio_emotion_model)
                _model = _VoiceEmotionModel()
            except Exception:
                logger.exception("Could not load the voice emotion model.")
                _load_failed = True
        return _model


def warm_up() -> None:
    _get_model()


def available() -> bool:
    return _get_model() is not None


# Recording-level calibration. The model was trained on 24 actors exaggerating emotions,
# so on real recordings it has a strong, recording-specific bias (e.g. a flat reading of
# a letter scored "happy" on 60% of lines). Dividing each line by the recording's
# average removes that bias and keeps what makes a line differ from the speaker's
# usual voice. The exponent < 1 keeps part of the absolute signal, so a call that is
# angry throughout still reads as angry rather than being normalised away.
CALIBRATION_STRENGTH = 0.8
MIN_LINES_TO_CALIBRATE = 4


def _calibrate(rows: List[np.ndarray], weights: List[float]) -> List[np.ndarray]:
    if len(rows) < MIN_LINES_TO_CALIBRATE:
        return rows
    baseline = np.average(np.stack(rows), axis=0, weights=weights)
    adjusted = [r / np.power(np.maximum(baseline, 1e-4), CALIBRATION_STRENGTH) for r in rows]
    return [r / r.sum() for r in adjusted]


def score_lines(audio: np.ndarray, spans: List[tuple[float, float]]) -> Optional[List[Optional[Dict[str, float]]]]:
    """Calibrated emotion-family distribution for each (start, end) span of `audio`, or
    None for spans too short to judge. Returns None overall if the model is unavailable."""
    model = _get_model()
    if model is None:
        return None

    families = sorted(set(LABEL_TO_FAMILY.values()))
    raw: List[Optional[np.ndarray]] = []
    for start, end in spans:
        a = max(int(start * SAMPLE_RATE), 0)
        b = min(int(end * SAMPLE_RATE), len(audio))
        if (b - a) / SAMPLE_RATE < MIN_CLIP_SECONDS:
            raw.append(None)
            continue

        step = int(MAX_CLIP_SECONDS * SAMPLE_RATE)
        chunks = [audio[i:min(i + step, b)] for i in range(a, b, step)]
        chunks = [c for c in chunks if len(c) / SAMPLE_RATE >= MIN_CLIP_SECONDS] or [audio[a:b]]
        weights = np.array([len(c) for c in chunks], dtype=np.float64)
        raw.append(np.average([model.probabilities(c) for c in chunks], axis=0, weights=weights))

    scored = [i for i, r in enumerate(raw) if r is not None]
    calibrated = _calibrate([raw[i] for i in scored], [spans[i][1] - spans[i][0] for i in scored])
    for i, probs in zip(scored, calibrated):
        raw[i] = probs

    results: List[Optional[Dict[str, float]]] = []
    for probs in raw:
        if probs is None:
            results.append(None)
            continue
        dist = {f: 0.0 for f in families}
        for label, p in zip(model.labels, probs):
            dist[LABEL_TO_FAMILY.get(label, "neutral")] += float(p)
        results.append(dist)
    return results
