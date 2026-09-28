# Starts the analysis server on this PC and a free Cloudflare tunnel to it, points the
# Vercel site at it, then prints the link to share. Run it through share.bat.

$root = $PSScriptRoot
$site = "https://conversation-analyzer-iota-umber.vercel.app"
$log = Join-Path $root "share-link.log"
$backendLog = Join-Path $root "backend.log"
$deployLog = Join-Path $root "share-deploy.log"
$pidFile = Join-Path $root "backend.pid"
$python = Join-Path $root "backend\venv\Scripts\python.exe"
$cloudflared = Join-Path $env:USERPROFILE "tools\cloudflared.exe"
if (-not (Test-Path $cloudflared)) { $cloudflared = "cloudflared" }

if (-not (Test-Path $python)) {
    Write-Host "No backend venv found. See backend\start.bat for how to create it." -ForegroundColor Red
    exit 1
}

# Stop a previous run, so port 8000 is free and the log only holds this run's address.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $pidFile) {
    taskkill /pid (Get-Content $pidFile) /t /f 2>$null | Out-Null
    Remove-Item $pidFile
}
# Older runs used a visible console window for the backend.
Get-Process cmd -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "*Conversation Analyzer backend*" } |
    ForEach-Object { taskkill /pid $_.Id /t /f | Out-Null }
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Remove-Item $log -ErrorAction SilentlyContinue

# Rebuild the dashboard so the backend (and the tunnel address) serve the latest design.
Write-Host "Building the dashboard..."
Push-Location (Join-Path $root "frontend")
$build = & npm.cmd run build 2>&1
$built = $LASTEXITCODE -eq 0
Pop-Location
if (-not $built) {
    Write-Host ($build | Select-Object -Last 15 | Out-String) -ForegroundColor DarkGray
    Write-Host "Dashboard build failed; serving the previous build." -ForegroundColor Yellow
}

# Run the backend with no console window: clicking into a console puts it in "Select"
# mode, which freezes the server until Esc is pressed. Output goes to backend.log, and
# the loop restarts the server if it ever exits.
$loop = @"
Set-Location '$($root -replace "'", "''")\backend'
while (`$true) {
    Add-Content -Path '$($backendLog -replace "'", "''")' -Value "--- backend started `$(Get-Date)"
    & '$($python -replace "'", "''")' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 *>> '$($backendLog -replace "'", "''")'
    Start-Sleep -Seconds 3
}
"@
$backend = Start-Process (Join-Path $PSHOME "powershell.exe") -WindowStyle Hidden -PassThru `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loop)))
Set-Content -Path $pidFile -Value $backend.Id

Start-Process $cloudflared -WindowStyle Hidden `
    -ArgumentList "tunnel", "--url", "http://localhost:8000", "--no-autoupdate", "--logfile", "`"$log`""

Write-Host "Starting the server and a public link, this takes about 30 seconds..."
$tunnel = $null
for ($i = 0; $i -lt 60 -and -not $tunnel; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Path $log) {
        $found = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -AllMatches
        if ($found) { $tunnel = ($found | Select-Object -Last 1).Matches[-1].Value }
    }
}
if (-not $tunnel) {
    Write-Host "Could not get a tunnel address. See share-link.log." -ForegroundColor Red
    exit 1
}

# New tunnel addresses take a little while to become reachable; wait so the link works right away.
$ready = $false
for ($i = 0; $i -lt 45 -and -not $ready; $i++) {
    try { $ready = (Invoke-RestMethod "$tunnel/api/health" -TimeoutSec 10).status -eq "ok" } catch { Start-Sleep -Seconds 4 }
}

# Redeploy the Vercel site with this address built in, so the plain site address works
# without ?server=... (uses this PC's Vercel CLI login; about a minute).
Write-Host "Updating the Vercel site to use this PC, about a minute..."
Push-Location (Join-Path $root "frontend")
$deploy = & npx.cmd --yes vercel deploy --prod --yes --build-env "NEXT_PUBLIC_API_BASE_URL=$tunnel" 2>&1
$deployed = $LASTEXITCODE -eq 0
Pop-Location
$deploy | Out-File -FilePath $deployLog -Encoding utf8

if ($deployed) {
    $link = $site
} else {
    Write-Host ($deploy | Select-Object -Last 10 | Out-String) -ForegroundColor DarkGray
    Write-Host "Vercel update failed (full output in share-deploy.log)." -ForegroundColor Yellow
    Write-Host "Sharing this PC's own address instead: it serves the same dashboard and the analysis server." -ForegroundColor Yellow
    $link = $tunnel
}
Set-Content -Path (Join-Path $root "share-link.txt") -Value $link
Set-Clipboard -Value $link
Write-Host ""
Write-Host "  Share this link (copied to your clipboard, also saved in share-link.txt):"
Write-Host ""
Write-Host "  $link" -ForegroundColor Green
Write-Host ""
if (-not $ready) { Write-Host "  (The server is still starting; the link may need another minute. See backend.log.)" -ForegroundColor Yellow }
Write-Host "The server and tunnel run in the background (no windows to keep open) while this PC is awake."
Write-Host "Run share.bat again to restart them with a new link."
