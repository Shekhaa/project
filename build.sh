#!/usr/bin/env bash
# Exit on error
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# Seed campus communities and the 5 GEHU students if database is fresh
python seed_campus_data.py || true
python seed_gehu_students.py || true
