# Campus Connect - 1-Click Launch Both Backend & Frontend
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Campus Connect - Launching Backend & Frontend" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Start Backend in a dedicated PowerShell window
Write-Host "[1/2] Launching Django Backend in a new window..." -ForegroundColor Yellow
$backendScript = Join-Path $PSScriptRoot "setup.ps1"
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$backendScript`""

Start-Sleep -Seconds 3

# 2. Start Frontend in this window (Tunnel mode guarantees phone connectivity)
Write-Host "[2/2] Starting React Native (Expo) Frontend in Tunnel mode..." -ForegroundColor Yellow
$frontendScript = Join-Path $PSScriptRoot "setup_frontend.ps1"
& powershell -ExecutionPolicy Bypass -File "$frontendScript" -Tunnel
