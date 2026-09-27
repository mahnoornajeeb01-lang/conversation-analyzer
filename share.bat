@echo off
rem Double-click to start the analysis server on this PC and get a link to share.
rem The link opens the Vercel site, which sends recordings to this PC for analysis.
rem It works while the backend and tunnel windows stay open and the PC is awake;
rem running this again replaces the previous run and creates a new link.
rem Full path: PowerShell isn't always on PATH.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0share.ps1"
pause
