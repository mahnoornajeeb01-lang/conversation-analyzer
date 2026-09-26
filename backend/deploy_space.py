"""Publish the backend to a Hugging Face Space (Docker SDK).

Reads from backend/.env (never uploaded):
  HF_WRITE_TOKEN     write token of the account that owns the Space
  HUGGINGFACE_TOKEN  read token for pyannote, stored as a Space secret

Usage:  venv/Scripts/python deploy_space.py [https://frontend-origin ...]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import CommitOperationAdd, HfApi

BACKEND_DIR = Path(__file__).resolve().parent
SPACE_NAME = "conversation-analyzer"

SPACE_README = """---
title: Conversation Analyzer API
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

Backend API for the Conversation Analyzer dashboard: speech-to-text, speaker
diarization, response latency, overlap, interruption and emotion analysis.

Health check: `/api/health`
"""


def main() -> None:
    env = dotenv_values(BACKEND_DIR / ".env")
    write_token = env.get("HF_WRITE_TOKEN")
    if not write_token:
        sys.exit("HF_WRITE_TOKEN is missing from backend/.env")

    api = HfApi(token=write_token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{SPACE_NAME}"
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

    origins = ["http://localhost:3000", *sys.argv[1:]]
    api.add_space_variable(repo_id, "ALLOWED_ORIGINS", json.dumps(origins))
    if env.get("HUGGINGFACE_TOKEN"):
        api.add_space_secret(repo_id, "HUGGINGFACE_TOKEN", env["HUGGINGFACE_TOKEN"])

    files = [BACKEND_DIR / "Dockerfile", BACKEND_DIR / "requirements.txt"]
    files += sorted((BACKEND_DIR / "app").rglob("*.py"))
    operations = [
        CommitOperationAdd(path_in_repo=f.relative_to(BACKEND_DIR).as_posix(), path_or_fileobj=str(f))
        for f in files
    ]
    operations.append(CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=SPACE_README.encode()))
    api.create_commit(repo_id, repo_type="space", operations=operations, commit_message="Deploy backend")

    subdomain = repo_id.replace("/", "-").replace("_", "-").lower()
    print(f"Space:    https://huggingface.co/spaces/{repo_id}")
    print(f"API URL:  https://{subdomain}.hf.space")


if __name__ == "__main__":
    main()
