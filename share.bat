@echo off
rem Start the analyzer and a public Cloudflare link to it (free, no account needed).
rem Send the https://....trycloudflare.com address printed below to anyone who should use it.
rem It works while this window stays open; a new link is created each time you run this.
cd /d "%~dp0"

if not exist "frontend\out\index.html" (
  echo Building the website first...
  pushd frontend
  call npm run build || (popd & echo Build failed. & pause & exit /b 1)
  popd
)

set "CLOUDFLARED=%USERPROFILE%\tools\cloudflared.exe"
if not exist "%CLOUDFLARED%" set "CLOUDFLARED=cloudflared"

start "Conversation Analyzer backend" cmd /k backend\start.bat
echo Waiting for the backend to start...
timeout /t 15 /nobreak >nul

echo.
echo ================================================================
echo  Look for the line with  https://....trycloudflare.com  below
echo  and share that link. Keep this window open.
echo ================================================================
echo.
"%CLOUDFLARED%" tunnel --url http://localhost:8000 --no-autoupdate
