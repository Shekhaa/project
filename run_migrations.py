import os
import sys
import django
from django.core.management import call_command

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

def run():
    print("==================================================")
    print("  Campus Connect - Database & Migration Engine")
    print("==================================================")

    db_path = os.path.join(os.path.dirname(__file__), "db.sqlite3")
    
    # If db.sqlite3 has conflicting schema from previous prototype runs, refresh it cleanly
    if os.path.exists(db_path):
        try:
            django.setup()
            from django.db import connection
            cursor = connection.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in cursor.fetchall()]
            
            # Clear transient test OTP rows before schema alterations
            if "otp_otp" in tables:
                cursor.execute("DELETE FROM otp_otp;")
                connection.commit()
                print(" -> Cleared transient OTP records.")
        except Exception as e:
            print(f" -> Checking db note: {e}")

    django.setup()

    print("\n[1/3] Generating pending migrations...")
    call_command("makemigrations", interactive=False)

    print("\n[2/3] Applying database migrations...")
    call_command("migrate", interactive=False)

    print("\n[2/2] Seeding canonical college data...")
    from seed_campus_data import seed
    seed()

    print("\n==================================================")
    print("  All migrations and seed data applied successfully!")
    print("==================================================")

if __name__ == "__main__":
    run()
