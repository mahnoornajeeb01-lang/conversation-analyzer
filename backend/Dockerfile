# Container for the Hugging Face Space (Docker SDK). Build context: backend/.
FROM python:3.11-slim

# libgomp1: OpenMP runtime for torch. DejaVu: PDF report font on Linux.
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

# CPU-only torch first so pyannote doesn't pull the multi-GB CUDA build.
RUN pip install --no-cache-dir --user \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.5.1 torchaudio==2.5.1

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# The pyannote model is gated and needs the HUGGINGFACE_TOKEN secret, so it downloads at startup.
COPY --chown=user app ./app
RUN mkdir -p data

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
