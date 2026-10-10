param(
    [switch]$Tunnel
)

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Campus Connect - React Native Frontend Setup" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
    if (Test-Path "$env:APPDATA\fnm\aliases\default") {
        $env:Path = "$env:APPDATA\fnm\aliases\default;" + $env:Path
    }
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue

if (-not $nodeCmd -or -not $npmCmd) {
    Write-Host "Error: Node.js / npm is not installed or not in your system PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js (v18 or v20 LTS) using one of these options:" -ForegroundColor Yellow
    Write-Host "  Option 1: Download installer from https://nodejs.org" -ForegroundColor White
    Write-Host "  Option 2: Run in Admin PowerShell: winget install OpenJS.NodeJS.LTS" -ForegroundColor White
    Write-Host "After installing, re-open PowerShell and re-run .\setup_frontend.ps1" -ForegroundColor Yellow
    Exit 1
}

$nodeVersion = node -v
$npmVersion = npm -v
Write-Host "[1/3] Detected Node.js $nodeVersion and npm $npmVersion" -ForegroundColor Green

# 2. Check & Copy .env
$mobileDir = Join-Path $PSScriptRoot "mobile"
$envFile = Join-Path $mobileDir ".env"
$envExample = Join-Path $mobileDir ".env.example"

if (-not (Test-Path $envFile) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envFile
    Write-Host "[2/3] Created mobile/.env from template." -ForegroundColor Green
} else {
    Write-Host "[2/3] mobile/.env configuration detected." -ForegroundColor Green
}

# 3. Detect Real Wi-Fi IP (ignores virtual 169.254.* link-local adapters)
$wifiIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -notlike "127.*" } | Select-Object -First 1).IPAddress
if ($wifiIp) {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifiIp
    Set-Content -Path $envFile -Value "EXPO_PUBLIC_API_URL=http://${wifiIp}:8000/api"
    Write-Host " -> Configured mobile/.env with real IP: http://${wifiIp}:8000/api" -ForegroundColor Cyan
    Write-Host " -> Bound Expo QR to real local IP: $wifiIp" -ForegroundColor Cyan
}

# 4. Install Dependencies
Write-Host "[3/3] Installing mobile dependencies in mobile/..." -ForegroundColor Yellow
Push-Location $mobileDir

try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: npm install failed. Please check the output above." -ForegroundColor Red
        Exit 1
    }

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  Campus Connect Mobile App Ready!" -ForegroundColor Green
    Write-Host "  Starting Expo Development Server..." -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tips:" -ForegroundColor Yellow
    Write-Host "  • Scan QR code using Expo Go app on physical phone" -ForegroundColor White
    Write-Host "  • Press 'a' to open in Android Emulator" -ForegroundColor White
    Write-Host "  • Press 'w' to open in Web Browser" -ForegroundColor White
    Write-Host "  • If QR fails on Wi-Fi, run: .\setup_frontend.ps1 -Tunnel" -ForegroundColor Cyan
    Write-Host ""

    if ($Tunnel) {
        Write-Host " -> Running in TUNNEL mode (bypasses Wi-Fi and firewall restrictions)..." -ForegroundColor Magenta
        npx expo start --tunnel
    } else {
        npx expo start
    }
}
finally {
    Pop-Location
}
