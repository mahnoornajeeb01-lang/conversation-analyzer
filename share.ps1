# Starts the analysis server on this PC and a free Cloudflare tunnel to it, then prints
# the link to the Vercel site wired to this PC. Run it through share.bat.

$root = $PSScriptRoot
$site = "https://conversation-analyzer-iota-umber.vercel.app"
$log = Join-Path $root "share-link.log"
$cloudflared = Join-Path $env:USERPROFILE "tools\cloudflared.exe"
if (-not (Test-Path $cloudflared)) { $cloudflared = "cloudflared" }

# Stop a previous run, so port 8000 is free and the log only holds this run's address.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process cmd -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "Conversation Analyzer backend*" } |
    ForEach-Object { taskkill /pid $_.Id /t /f | Out-Null }
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Remove-Item $log -ErrorAction SilentlyContinue

Start-Process cmd -ArgumentList "/k", "title Conversation Analyzer backend && backend\start.bat" -WorkingDirectory $root
Start-Process $cloudflared -ArgumentList "tunnel", "--url", "http://localhost:8000", "--no-autoupdate", "--logfile", "`"$log`"" -WindowStyle Minimized

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
    Write-Host "Could not get a tunnel address. Check the minimized tunnel window." -ForegroundColor Red
    exit 1
}

# New tunnel addresses take a little while to become reachable; wait so the link works right away.
$ready = $false
for ($i = 0; $i -lt 45 -and -not $ready; $i++) {
    try { $ready = (Invoke-RestMethod "$tunnel/api/health" -TimeoutSec 10).status -eq "ok" } catch { Start-Sleep -Seconds 4 }
}

$link = "$site/?server=$tunnel"
Set-Content -Path (Join-Path $root "share-link.txt") -Value $link
Set-Clipboard -Value $link
Write-Host ""
Write-Host "  Share this link (copied to your clipboard, also saved in share-link.txt):"
Write-Host ""
Write-Host "  $link" -ForegroundColor Green
Write-Host ""
if (-not $ready) { Write-Host "  (The server is still starting; the link may need another minute.)" -ForegroundColor Yellow }
Write-Host "Keep the backend window and the minimized tunnel window open while people use the link."
