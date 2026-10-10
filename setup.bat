@echo off
echo ========================================================
echo   Campus Connect - Backend Setup ^& Runbook
echo ========================================================
echo.

:: 1. Virtual Environment
if not exist "venv" (
    echo [1/4] Creating Python virtual environment (venv)...
    python -m venv venv
    if errorlevel 1 (
        echo Error: Python was not found in PATH or failed to create venv.
        pause
        exit /b %errorlevel%
    )
) else (
    echo [1/4] Virtual environment detected.
)

:: 2. Activate Virtual Environment
echo [2/4] Activating virtual environment...
call venv\Scripts\activate

:: 3. Install Dependencies
echo [3/4] Installing packages from requirements.txt...
pip install -r requirements.txt

:: 4. Migrate and Seed
echo [4/4] Applying migrations and seeding canonical data...
python run_migrations.py

if errorlevel 1 (
    echo Error during database migration or seeding.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo   Campus Connect Backend Ready!
echo.
echo   API Base: http://127.0.0.1:8000/api/
echo   Admin:    http://127.0.0.1:8000/admin/
echo.
echo   Credentials:
echo     Admin:   admin@campusconnect.local / admin123
echo     Student: student@geu.ac.in         / student123
echo ========================================================
python manage.py runserver
pause
