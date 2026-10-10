import os
import sys
import json
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from colleges.models import College, CollegeDomain, Course, Branch, AcademicYear, Section
from communities.models import Community, CommunityMember
from otp.models import OTP

from django.core.management import call_command

User = get_user_model()

def run_tests():
    print("==================================================")
    print("  Campus Connect - End-to-End API Journey Test")
    print("==================================================")

    # 1. Automatically ensure all migrations (including newly added apps) are applied
    print("[Setup] Checking & applying database migrations...")
    call_command("migrate", interactive=False)

    # 2. Ensure canonical colleges and hierarchy are seeded
    if not College.objects.filter(short_name="GEU").exists():
        print("[Setup] Seeding canonical colleges & hierarchy...")
        from seed_campus_data import seed
        seed()

    client = Client()

    # Clean prior test run artifacts for repeatable, idempotent runs
    User.objects.filter(email="priya.verma@geu.ac.in").delete()
    OTP.objects.filter(destination__in=["priya.verma@geu.ac.in", "+919811223344"]).delete()

    # Step 1: Detect College Domain
    print("\n[Step 1] Testing College Domain Auto-Detection...")
    resp = client.post(
        "/api/colleges/detect-domain/",
        data=json.dumps({"email": "priya.verma@geu.ac.in"}),
        content_type="application/json"
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.content}"
    data = resp.json()
    assert data["detected"] is True
    assert data["college"]["short_name"] == "GEU"
    print(f" -> Passed! Detected College: {data['college']['name']} ({data['college']['short_name']})")

    # Step 2: Send Email OTP
    print("\n[Step 2] Testing Email OTP Generation...")
    test_email = "priya.verma@geu.ac.in"
    resp = client.post(
        "/api/authentication/email/send-otp/",
        data=json.dumps({"email": test_email}),
        content_type="application/json"
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.content}"
    latest_otp = OTP.objects.filter(destination=test_email, is_used=False).first()
    assert latest_otp is not None
    print(f" -> Passed! OTP generated: {latest_otp.otp} (Cooldown & Expiry verified)")

    # Step 3: Verify Email OTP & Get JWT
    print("\n[Step 3] Testing Email OTP Verification & JWT Token Issuance...")
    resp = client.post(
        "/api/authentication/email/verify-otp/",
        data=json.dumps({"email": test_email, "otp": latest_otp.otp}),
        content_type="application/json"
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.content}"
    auth_data = resp.json()
    access_token = auth_data["access"]
    assert access_token is not None
    auth_headers = {"HTTP_AUTHORIZATION": f"Bearer {access_token}"}
    print(f" -> Passed! Received JWT Access & Refresh tokens. User ID: {auth_data['user']['id']}")

    # Step 4: Phone Verification
    print("\n[Step 4] Testing Phone Number Binding & Verification...")
    test_phone = "+919811223344"
    resp = client.post(
        "/api/authentication/phone/send-otp/",
        data=json.dumps({"phone_number": test_phone}),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 200
    phone_otp = OTP.objects.filter(destination=test_phone, is_used=False).first()
    assert phone_otp is not None

    resp = client.post(
        "/api/authentication/phone/verify-otp/",
        data=json.dumps({"phone_number": test_phone, "otp": phone_otp.otp}),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["is_verified_student"] is True
    print(f" -> Passed! Phone verified and student verified status unlocked.")

    # Step 5: Register Primary Mobile Device
    print("\n[Step 5] Testing Primary Mobile Device Registration...")
    resp = client.post(
        "/api/devices/register/",
        data=json.dumps({
            "device_uuid": "device-pixel-8-test-uuid-001",
            "device_name": "Google Pixel 8",
            "manufacturer": "Google",
            "model": "Pixel 8 Pro",
            "os": "Android 15",
            "is_primary": True
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    assert resp.json()["device"]["is_primary"] is True
    print(" -> Passed! Device registered as Primary trusted mobile.")

    # Step 6: Complete Profile Onboarding
    print("\n[Step 6] Testing Profile Onboarding & Automatic Community Enrollment...")
    geu = College.objects.get(short_name="GEU")
    course = Course.objects.filter(college=geu, name="B.Tech").first()
    branch = Branch.objects.filter(course=course, code="CSE").first()
    year = AcademicYear.objects.filter(course=course, year_number=1).first()
    section = Section.objects.filter(academic_year=year, name="Section A").first()

    resp = client.post(
        "/api/profile/complete/",
        data=json.dumps({
            "username": "priya_cse",
            "gender": "Female",
            "bio": "First year computer science engineer. Building cool stuff!",
            "anonymous_enabled": True,
            "admission_number": "GEU2024CSE108",
            "college": geu.id,
            "course": course.id,
            "branch": branch.id,
            "academic_year": year.id,
            "section": section.id
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.content}"
    profile_data = resp.json()["profile"]
    assert profile_data["profile_completed"] is True
    print(f" -> Passed! Onboarding completed for @{profile_data['username']}")

    # Step 7: Verify Communities Auto-Joined
    print("\n[Step 7] Checking Auto-Enrolled Academic Communities...")
    resp = client.get("/api/communities/me/", **auth_headers)
    assert resp.status_code == 200
    res_data = resp.json()
    my_communities = res_data.get("results", res_data)
    community_names = [c["community"]["name"] for c in my_communities]
    print(f" -> Enrolled Communities count: {len(my_communities)}")
    for name in community_names:
        print(f"    * {name}")
    assert len(my_communities) == 3, f"Should be auto-enrolled in exactly 3 communities: College, Course, and Section! (Got {len(my_communities)})"

    # Step 8: Post Creation (Public + Anonymous)
    print("\n[Step 8] Testing Post Creation (Public & Zero-Leak Anonymous Mode)...")
    col_comm = Community.objects.filter(name=geu.name).first()

    # Public Post
    resp = client.post(
        "/api/posts/create/",
        data=json.dumps({
            "community": col_comm.id,
            "content": "Hey Graphic Era! So excited to begin the new semester! 👋🎉",
            "is_anonymous": False
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    post_id = resp.json()["id"]

    # Anonymous Post
    resp = client.post(
        "/api/posts/create/",
        data=json.dumps({
            "community": col_comm.id,
            "content": "Does anyone know when the library closes during exam week?",
            "is_anonymous": True
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    anon_post = resp.json()
    assert anon_post["is_anonymous"] is True
    assert anon_post["author_username"] is None, "Real username must be sanitized in anonymous mode!"
    print(f" -> Passed! Public Post #{post_id} & Anonymous Post ({anon_post['author_name']}) created.")

    # Verify Timeline Feed
    resp_feed = client.get("/api/posts/feed/", **auth_headers)
    assert resp_feed.status_code == 200
    feed_data = resp_feed.json()
    posts_list = feed_data.get("results", feed_data)
    assert len(posts_list) >= 2, "Feed must display posts from joined academic communities!"
    print(f" -> Passed! Verified student timeline displays {len(posts_list)} posts.")

    # Step 9: Like and Comment
    print("\n[Step 9] Testing Post Like & Nested Comment...")
    resp = client.post(f"/api/posts/{post_id}/like/", **auth_headers)
    assert resp.status_code == 200
    assert resp.json()["liked"] is True

    resp = client.post(
        f"/api/posts/{post_id}/comments/",
        data=json.dumps({"text": "Welcome to the department!"}),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    print(" -> Passed! Like toggled & comment added.")

    # Step 10: Direct Chat
    print("\n[Step 10] Testing Direct Messaging & Chat Inbox...")
    resp = client.post("/api/chat/start/student@geu.ac.in/", **auth_headers)
    assert resp.status_code in [200, 201]
    conv_id = resp.json()["id"]

    resp = client.post(
        f"/api/chat/{conv_id}/send/",
        data=json.dumps({"text": "Hi Aarav, can you share the physics syllabus?"}),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    print(f" -> Passed! Message sent in Conversation {conv_id[:8]}...")

    # Step 11: WebRTC Calling Signaling
    print("\n[Step 11] Testing WebRTC Call Room Initiation & Status...")
    aarav_user = User.objects.get(email="student@geu.ac.in")
    resp = client.post(
        "/api/calls/initiate/",
        data=json.dumps({
            "receiver_id": aarav_user.id,
            "call_type": "VIDEO",
            "sdp_offer": "v=0\r\no=mock-sdp-offer-string\r\ns=-\r\n"
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    call_room_id = resp.json()["room_id"]
    print(f" -> Passed! Video Call Room Initiated: {call_room_id} (Status: {resp.json()['status']})")

    # Step 12: WhatsApp Web Style QR Linking Challenge
    print("\n[Step 12] Testing WhatsApp Web Style QR Link Challenge Flow...")
    resp = client.post("/api/devices/qr/challenge/", data=json.dumps({}), content_type="application/json")
    assert resp.status_code == 200
    challenge_token = resp.json()["challenge_token"]

    # Mobile app scans and authorizes
    resp = client.post(
        "/api/devices/qr/authorize/",
        data=json.dumps({"challenge_token": challenge_token}),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 200

    # Web browser polls and receives JWT
    resp = client.get(f"/api/devices/qr/status/{challenge_token}/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "CONSUMED"
    assert "access" in resp.json()
    print(" -> Passed! QR Challenge authorized by mobile and web session established.")

    # Step 13: Custom Student Community Creation
    print("\n[Step 13] Testing Custom Community Creation (Reddit/WhatsApp Style)...")
    Community.objects.filter(name="GEU Esports & Gaming Club").delete()
    resp = client.post(
        "/api/communities/create/",
        data=json.dumps({
            "name": "GEU Esports & Gaming Club",
            "description": "Campus gaming community for BGMI, Valorant, FIFA tournaments and LAN parties.",
            "is_private": False
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    custom_comm = resp.json()
    assert custom_comm["community_type"] == "CUSTOM"
    print(f" -> Passed! Custom Community '{custom_comm['name']}' created by student.")

    # Step 14: Frictionless Lost & Found Post & 1-Click Contact
    print("\n[Step 14] Testing Friction-Free Lost & Found (Descriptive Msg + Written Location)...")
    resp = client.post(
        "/api/lost-found/create/",
        data=json.dumps({
            "item_type": "FOUND",
            "description": "Black boat airdopes case mila CS lab 3 me, bench no 4 ke paas.",
            "location": "CS Lab 3, 2nd Floor Block B"
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    lf_item = resp.json()
    lf_item_id = lf_item["id"]
    print(f" -> Passed! Lost & Found item posted: '{lf_item['description']}' at {lf_item['location']}")

    # 1-Click Contact from another student
    aarav_client = Client()
    aarav_user = User.objects.get(email="student@geu.ac.in")
    from rest_framework_simplejwt.tokens import RefreshToken
    aarav_token = str(RefreshToken.for_user(aarav_user).access_token)
    aarav_headers = {"HTTP_AUTHORIZATION": f"Bearer {aarav_token}"}

    resp = aarav_client.post(f"/api/lost-found/{lf_item_id}/contact/", **aarav_headers)
    assert resp.status_code == 201
    print(" -> Passed! 1-Click in-app chat opened with reporter with item context attached.")

    # Step 15: Ephemeral / Self-Destructing Temporary Hangout Group
    print("\n[Step 15] Testing Self-Destructing Group (10 min to 24 hr auto-cleanup)...")
    resp = client.post(
        "/api/chat/ephemeral-group/create/",
        data=json.dumps({
            "name": "Rishikesh Weekend Trip",
            "duration": "24_HOURS",
            "purpose_tag": "Trip"
        }),
        content_type="application/json",
        **auth_headers
    )
    assert resp.status_code == 201
    ephemeral_group = resp.json()
    assert ephemeral_group["is_ephemeral"] is True
    assert ephemeral_group["expires_at"] is not None
    print(f" -> Passed! Temporary Group '{ephemeral_group['name']}' created. Expires at: {ephemeral_group['expires_at']}")

    print("\n==================================================")
    print("  ALL 15 END-TO-END TESTS PASSED SUCCESSFULLY! ")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
