# PowerShell Setup Script for Campus Connect Backend
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Campus Connect - Automated Backend Setup" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check Python
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host "Error: Python is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from python.org and check 'Add Python to PATH'." -ForegroundColor Yellow
    Exit 1
}

# 2. Virtual Environment Creation
if (-not (Test-Path "venv")) {
    Write-Host "[1/4] Creating Python virtual environment (venv)..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to create virtual environment." -ForegroundColor Red
        Exit 1
    }
    Write-Host " -> Virtual environment created successfully." -ForegroundColor Green
} else {
    Write-Host "[1/4] Virtual environment detected." -ForegroundColor Green
}

# 3. Path to venv Python & Pip (guarantees zero execution policy blockage)
$venvPython = ".\venv\Scripts\python.exe"
$venvPip = ".\venv\Scripts\pip.exe"

# 4. Install Dependencies
Write-Host "[2/4] Installing backend dependencies from requirements.txt..." -ForegroundColor Yellow
& $venvPython -m pip install --upgrade pip --quiet
& $venvPython -m pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to install requirements." -ForegroundColor Red
    Exit 1
}
Write-Host " -> Dependencies installed successfully." -ForegroundColor Green

# 5. Database Migrations and Canonical Seeding
Write-Host "[3/4] Applying database migrations & seeding canonical data..." -ForegroundColor Yellow
& $venvPython run_migrations.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Migration or seeding failed. Please check the output above." -ForegroundColor Red
    Exit 1
}

# 6. Success & Runserver
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Campus Connect Backend Ready!" -ForegroundColor Green
Write-Host "  API URL: http://127.0.0.1:8000/api/" -ForegroundColor Green
Write-Host "  Admin:   http://127.0.0.1:8000/admin/" -ForegroundColor Green
Write-Host ""
Write-Host "  Pre-seeded Demo Credentials:" -ForegroundColor Cyan
Write-Host "    Admin:   admin@campusconnect.local / admin123"
Write-Host "    Student: student@geu.ac.in         / student123"
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[4/4] Starting Django Development Server..." -ForegroundColor Yellow
& $venvPython manage.py runserver 0.0.0.0:8000
