# Container for the Hugging Face Space (Docker SDK). Build context: backend/.
FROM python:3.11-slim

# libgomp1: OpenMP runtime for ctranslate2/onnxruntime. DejaVu: PDF report font on Linux.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Spaces run the container as uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1
WORKDIR /home/user/app

# CPU-only torch first so pyannote/transformers don't pull the multi-GB CUDA build.
RUN pip install --no-cache-dir --user \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.5.1 torchaudio==2.5.1

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt \
    pyannote.audio==3.3.2 "huggingface_hub<1.0" matplotlib \
    transformers==4.57.6 tokenizers==0.22.2

# Bake the public models into the image so a cold start doesn't re-download them.
# (pyannote is gated and needs the HUGGINGFACE_TOKEN secret, so it downloads at startup.)
RUN python -c "\
from huggingface_hub import snapshot_download; \
snapshot_download('Systran/faster-whisper-small'); \
snapshot_download('ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition'); \
snapshot_download('SamLowe/roberta-base-go_emotions-onnx')"

COPY --chown=user app ./app
RUN mkdir -p data

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
