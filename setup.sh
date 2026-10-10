#!/bin/bash
set -e

echo "========================================================"
echo "  Campus Connect - Automated Backend Setup (Unix/macOS)"
echo "========================================================"

# 1. Virtual Environment
if [ ! -d "venv" ]; then
    echo "[1/4] Creating Python virtual environment (venv)..."
    python3 -m venv venv
    echo " -> Virtual environment created."
else
    echo "[1/4] Virtual environment detected."
fi

# 2. Install Dependencies
echo "[2/4] Installing backend requirements..."
./venv/bin/python -m pip install --upgrade pip --quiet
./venv/bin/python -m pip install -r requirements.txt

# 3. Migrations & Seeding
echo "[3/4] Applying database migrations & seeding data..."
./venv/bin/python run_migrations.py

echo ""
echo "========================================================"
echo "  Campus Connect Backend Ready!"
echo "  API URL: http://127.0.0.1:8000/api/"
echo "  Admin:   http://127.0.0.1:8000/admin/"
echo ""
echo "  Pre-seeded Demo Credentials:"
echo "    Admin:   admin@campusconnect.local / admin123"
echo "    Student: student@geu.ac.in         / student123"
echo "========================================================"
echo ""
echo "[4/4] Starting Django Development Server..."
./venv/bin/python manage.py runserver 0.0.0.0:8000
