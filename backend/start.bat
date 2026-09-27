@echo off
rem Start the API with this folder's venv, without relying on "activate"
rem (activate scripts hardcode the folder the venv was created in).
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
  echo No venv found. Create it with:  py -3.11 -m venv venv ^&^& venv\Scripts\python -m pip install -r requirements.txt
  exit /b 1
)
"venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 %*
