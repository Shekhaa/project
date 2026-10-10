import os
import sys
import json
import django

# Setup Django standalone environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from rest_framework.test import APIClient
from colleges.models import College, CollegeDomain
from accounts.models import User
from otp.models import OTP

def test_hybrid_flow():
    client = APIClient()

    print("==================================================")
    print("  Testing Campus Connect - Hybrid Onboarding Flow")
    print("==================================================")

    # ----------------------------------------------------
    # TRACK 1: 1-Click Magic Link Flow
    # ----------------------------------------------------
    print("\n--- [Track 1] Testing 1-Click Magic Link Flow ---")
    test_email_1 = "rahul.magic@geu.ac.in"
    User.objects.filter(email=test_email_1).delete()
    OTP.objects.filter(destination=test_email_1).delete()

    # Step 1.1: Request Email OTP
    res = client.post("/api/authentication/email/send-otp/", {"email": test_email_1}, format="json")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.data}"
    magic_token = res.data.get("magic_token")
    magic_link = res.data.get("magic_link")
    assert magic_token is not None, "magic_token missing from response"
    print(f" -> OTP & Magic Link generated:")
    print(f"    magic_token: {magic_token}")
    print(f"    magic_link: {magic_link}")

    # Step 1.2: Student clicks magic link (GET /api/authentication/email/magic-login/?token=...)
    # Test JSON mode
    res = client.get(f"/api/authentication/email/magic-login/?token={magic_token}", HTTP_ACCEPT="application/json")
    assert res.status_code == 200, f"Magic login failed: {res.data}"
    assert "access" in res.data, "JWT access token missing"
    assert res.data["detected_college"]["short_name"] == "GEU"
    assert res.data["user"]["is_email_verified"] is True
    print(f" -> Magic Link 1-Click Verified! Student logged in with JWT: {res.data['user']['email']}")

    # Step 1.3: Re-use prevention
    res_reuse = client.get(f"/api/authentication/email/magic-login/?token={magic_token}", HTTP_ACCEPT="application/json")
    assert res_reuse.status_code == 400, "Reused magic token should be rejected"
    print(f" -> Security Check Passed: Replay/reuse attack blocked.")

    # ----------------------------------------------------
    # TRACK 2: Microsoft Entra ID (Azure SSO) Flow
    # ----------------------------------------------------
    print("\n--- [Track 2] Testing Microsoft Entra ID Single-Tap SSO ---")

    # Step 2.1: Non-college email attempt (e.g. personal gmail)
    res_fake = client.post(
        "/api/authentication/microsoft/",
        {"dev_mock_email": "chandra.shekhar@gmail.com", "dev_mock_name": "Chandra Shekhar"},
        format="json"
    )
    assert res_fake.status_code == 403, f"Expected 403 for non-college email, got {res_fake.status_code}"
    print(f" -> College Gatekeeper Active: Non-university Microsoft account blocked (403).")

    # Step 2.2: Official College Microsoft Account
    ms_college_email = "akshit.malik@geu.ac.in"
    User.objects.filter(email=ms_college_email).delete()

    res_ms = client.post(
        "/api/authentication/microsoft/",
        {"dev_mock_email": ms_college_email, "dev_mock_name": "Akshit Malik"},
        format="json"
    )
    assert res_ms.status_code == 200, f"Microsoft SSO failed: {res_ms.data}"
    assert res_ms.data["detected_college"]["name"] == "Graphic Era University"
    assert res_ms.data["user"]["full_name"] == "Akshit Malik"
    assert res_ms.data["user"]["is_email_verified"] is True
    ms_token = res_ms.data["access"]
    print(f" -> Single-Tap Microsoft Login Successful!")
    print(f"    Student: {res_ms.data['user']['full_name']} ({res_ms.data['user']['email']})")
    print(f"    Detected College: {res_ms.data['detected_college']['name']}")

    # ----------------------------------------------------
    # TRACK 3: Verify Profile Setup & 3 Default Communities
    # ----------------------------------------------------
    print("\n--- [Track 3] Completing Profile for SSO User & Auto-Joining 3 Communities ---")
    auth_client = APIClient()
    auth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {ms_token}")

    geu = College.objects.get(short_name="GEU")
    course = geu.courses.filter(name__icontains="B.Tech").first()
    branch = course.branches.first()
    year = course.academic_years.first()
    section = year.sections.first()

    profile_payload = {
        "username": "akshit_malik",
        "gender": "Male",
        "college": geu.id,
        "course": course.id,
        "branch": branch.id,
        "academic_year": year.id,
        "section": section.id,
        "admission_number": "GEU/2026/CS/999",
        "bio": "Building the future on Campus Connect."
    }

    res_prof = auth_client.post("/api/profile/complete/", profile_payload, format="json")
    assert res_prof.status_code == 201, f"Profile setup failed: {res_prof.data}"
    assert res_prof.data["profile"]["profile_completed"] is True
    print(f" -> Profile locked and completed.")

    # Check that exactly 3 default communities were auto-joined
    res_comm = auth_client.get("/api/communities/me/")
    assert res_comm.status_code == 200, f"Failed to get communities: {res_comm.data}"
    comm_list = res_comm.data.get("results", res_comm.data)
    assert len(comm_list) == 3, f"Expected 3 default communities, got {len(comm_list)}"
    print(f" -> Verified 3 Auto-Joined Communities:")
    for c in comm_list:
        comm_obj = c.get("community", c)
        print(f"    [{comm_obj.get('community_type', 'COMMUNITY')}] {comm_obj.get('name')}")

    print("\n==================================================")
    print("  ALL HYBRID ONBOARDING TESTS PASSED (100% SUCCESS)!")
    print("==================================================\n")

if __name__ == "__main__":
    test_hybrid_flow()
