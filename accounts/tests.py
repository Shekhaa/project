import base64
import io
import json
import shutil
import tempfile
from datetime import timedelta
from PIL import Image as PILImage
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from colleges.models import College, CollegeDomain, Course, Branch, AcademicYear
from communities.models import Community, CommunityMember, Discussion
from notifications.models import Notification
from posts.models import Post
from profiles.models import StudentProfile, UserBlock
from .models import CampusInviteCode

User = get_user_model()


class DirectorySearchTests(TestCase):
    def setUp(self):
        self._media_dir = tempfile.mkdtemp(prefix="campus_acct_test_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        self.college = College.objects.create(name="Graphic Era University", short_name="GEU")
        self.course = Course.objects.create(name="B.Tech", code="BT", college=self.college, duration=4)
        self.branch = Branch.objects.create(name="CSE", code="CSE", course=self.course)
        self.year = AcademicYear.objects.create(year_number=2, display_name="2nd Year", course=self.course)

        self.me = User.objects.create_user(email="me@geu.ac.in", password="password123", full_name="Current Student")
        StudentProfile.objects.create(
            user=self.me, username="me_geu", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU001", profile_completed=True
        )

        buf = io.BytesIO()
        PILImage.new("RGB", (120, 120), color=(94, 106, 210)).save(buf, "JPEG")
        buf.seek(0)
        pic = SimpleUploadedFile("riha.jpg", buf.read(), content_type="image/jpeg")

        self.peer = User.objects.create_user(email="riya@geu.ac.in", password="password123", full_name="Riya Verma")
        StudentProfile.objects.create(
            user=self.peer, username="riya_v", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU204", profile_picture=pic, profile_completed=True
        )

        self.blocked_user = User.objects.create_user(
            email="riya_blocked@geu.ac.in", password="password123", full_name="Riya Blocked"
        )
        StudentProfile.objects.create(
            user=self.blocked_user, username="riya_blk", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU999", profile_completed=True
        )
        UserBlock.objects.create(blocker=self.me, blocked=self.blocked_user)

        self.client = APIClient()
        self.client.force_authenticate(user=self.me)

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def test_directory_search_by_name_username_and_admission_with_avatar_and_block_filter(self):
        # Empty query still returns active non-blocked peers for immediate '@' suggestion popup
        empty_res = self.client.get("/api/authentication/users/search/?q=")
        self.assertEqual(empty_res.status_code, status.HTTP_200_OK)
        ids = [u["id"] for u in empty_res.data["results"]]
        self.assertIn(self.peer.id, ids)
        self.assertNotIn(self.me.id, ids)
        self.assertNotIn(self.blocked_user.id, ids)

        # Search by name / username returns resolved avatar & academic metadata
        name_res = self.client.get("/api/authentication/users/search/?q=Riya")
        self.assertEqual(name_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(name_res.data["results"]), 1)
        item = name_res.data["results"][0]
        self.assertEqual(item["username"], "riya_v")
        self.assertEqual(item["college_name"], "Graphic Era University")
        self.assertEqual(item["branch_name"], "CSE")
        self.assertTrue(item["avatar"].startswith("http"))
        self.assertEqual(item["avatar"], item["profile_picture"])

        # Search by roll/admission number also finds student
        roll_res = self.client.get("/api/authentication/users/search/?q=GEU204")
        self.assertEqual(roll_res.status_code, status.HTTP_200_OK)
        self.assertEqual(roll_res.data["results"][0]["id"], self.peer.id)


def _make_fake_ms_jwt(email: str, name: str = "Campus Student") -> str:
    def _b64(obj):
        raw = json.dumps(obj).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    header = _b64({"alg": "RS256", "typ": "JWT"})
    payload = _b64({"email": email, "name": name, "preferred_username": email})
    return f"{header}.{payload}.dummy_sig"


def _make_png_bytes(width=240, height=160, color=(94, 106, 210)) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color=color).save(buf, "PNG")
    return buf.getvalue()


@override_settings(
    DEBUG=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    RESEND_API_KEY="",
)
class VerificationGateAndAuthFlowsTests(TestCase):
    def setUp(self):
        cache.clear()
        self._media_dir = tempfile.mkdtemp(prefix="campus_gate_test_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        self.geu = College.objects.create(name="Graphic Era University", short_name="GEU")
        CollegeDomain.objects.create(college=self.geu, domain="geu.ac.in")
        self.course = Course.objects.create(name="B.Tech", code="BT", college=self.geu, duration=4)
        self.branch = Branch.objects.create(name="Computer Science", code="CSE", course=self.course)
        self.year = AcademicYear.objects.create(year_number=1, display_name="1st Year", course=self.course)

        # Staff admin
        self.admin = User.objects.create_user(
            email="admin@campusconnect.local",
            password="admin123",
            full_name="Campus Admin",
            is_staff=True,
            is_superuser=True,
            is_email_verified=True,
            is_verified_student=True,
        )
        StudentProfile.objects.create(
            user=self.admin,
            username="campus_admin",
            college=self.geu,
            course=self.course,
            branch=self.branch,
            academic_year=self.year,
            verified=True,
            id_card_verified=True,
            verification_method="ADMIN_VERIFIED",
            profile_completed=True,
        )

        # Verified institutional peer
        self.verified_peer = User.objects.create_user(
            email="aarav@geu.ac.in",
            password="password123",
            full_name="Aarav Sharma",
            is_email_verified=True,
            is_verified_student=True,
        )
        StudentProfile.objects.create(
            user=self.verified_peer,
            username="aarav_cse",
            college=self.geu,
            course=self.course,
            branch=self.branch,
            academic_year=self.year,
            admission_number="GEU042",
            verified=True,
            id_card_verified=True,
            verification_method="MICROSOFT_SSO",
            profile_completed=True,
        )

        # Private verified account for feed leak testing
        self.private_peer = User.objects.create_user(
            email="hidden@geu.ac.in",
            password="password123",
            full_name="Hidden Student",
            is_email_verified=True,
            is_verified_student=True,
        )
        StudentProfile.objects.create(
            user=self.private_peer,
            username="hidden_geu",
            college=self.geu,
            course=self.course,
            branch=self.branch,
            academic_year=self.year,
            admission_number="GEU043",
            is_private_account=True,
            verified=True,
            verification_method="EMAIL_OTP",
            profile_completed=True,
        )

        # Community & Discussion for testing gates
        self.community = Community.objects.create(
            name="GEU Discussions",
            community_type="COLLEGE",
            description="Official GEU Community",
            is_system_managed=True,
        )
        CommunityMember.objects.create(community=self.community, user=self.verified_peer, role="MEMBER")
        self.discussion = Discussion.objects.create(
            community=self.community,
            author=self.verified_peer,
            title="Mid-sem timetable check?",
            content="Anyone seen the CSE timetable yet?",
        )

        # Seed public & anonymous posts
        self.public_post = Post.objects.create(
            author=self.verified_peer,
            content="Campus fest prep starts today!",
            visibility="GLOBAL",
        )
        self.anon_post = Post.objects.create(
            author=self.verified_peer,
            content="Best coffee near canteen?",
            visibility="COLLEGE",
            is_anonymous=True,
            anonymous_alias="Anonymous Owl",
        )
        self.private_post = Post.objects.create(
            author=self.private_peer,
            content="Should not appear to guests",
            visibility="GLOBAL",
        )

    def tearDown(self):
        cache.clear()
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def test_guest_read_only_feed_redacts_anonymous_and_excludes_private(self):
        guest = APIClient()
        res = guest.get("/api/posts/feed/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        items = res.data["results"]
        ids = [p["id"] for p in items]
        self.assertIn(self.public_post.id, ids)
        self.assertIn(self.anon_post.id, ids)
        self.assertNotIn(self.private_post.id, ids)

        anon_item = next(p for p in items if p["id"] == self.anon_post.id)
        self.assertTrue(anon_item["is_anonymous"])
        self.assertIsNone(anon_item["author"])
        self.assertIsNone(anon_item["author_username"])
        self.assertIsNone(anon_item["author_avatar"])
        self.assertEqual(anon_item["author_name"], "Anonymous Owl")
        self.assertEqual(anon_item["author_college_name"], "Graphic Era University")

        # Restricted scopes return empty results cleanly rather than 500 or leaks
        comm_res = guest.get("/api/posts/feed/?scope=COMMUNITY")
        self.assertEqual(comm_res.status_code, status.HTTP_200_OK)
        self.assertEqual(comm_res.data["results"], [])

        # Detail permalink works for public post and blocks private post safely
        pub_detail = guest.get(f"/api/posts/{self.public_post.id}/")
        self.assertEqual(pub_detail.status_code, status.HTTP_200_OK)
        priv_detail = guest.get(f"/api/posts/{self.private_post.id}/")
        self.assertEqual(priv_detail.status_code, status.HTTP_403_FORBIDDEN)

    def test_gmail_otp_signup_starts_read_only_and_is_blocked_from_writing(self):
        anon = APIClient()
        send_res = anon.post("/api/authentication/email/send-otp/", {"email": "rohit.geu@gmail.com"}, format="json")
        self.assertEqual(send_res.status_code, status.HTTP_200_OK)
        self.assertTrue(send_res.data["is_personal_email"])
        otp = send_res.data["dev_otp"]

        verify_res = anon.post(
            "/api/authentication/email/verify-otp/",
            {"email": "rohit.geu@gmail.com", "otp": otp},
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertFalse(verify_res.data["user"]["can_participate"])
        self.assertEqual(verify_res.data["user"]["verification_tier"], "UNVERIFIED")

        gmail_client = APIClient()
        gmail_client.credentials(HTTP_AUTHORIZATION=f"Bearer {verify_res.data['access']}")

        # Onboarding without roll number or invite code leaves user in read-only UNVERIFIED
        comp_res = gmail_client.post(
            "/api/profile/complete/",
            {
                "full_name": "Rohit Kumar",
                "username": "rohit_k",
                "college": self.geu.id,
                "course": self.course.id,
                "branch": self.branch.id,
                "academic_year": self.year.id,
                "bio": "Joining GEU!",
                "gender": "Male",
            },
            format="json",
        )
        self.assertEqual(comp_res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(comp_res.data["user"]["can_participate"])
        self.assertEqual(comp_res.data["user"]["verification_tier"], "UNVERIFIED")

        # All mutating write actions return 403 CAMPUS_VERIFICATION_REQUIRED
        write_checks = [
            gmail_client.post("/api/posts/create/", {"content": "Hello", "visibility": "GLOBAL"}, format="json"),
            gmail_client.post(f"/api/posts/{self.public_post.id}/like/", {}, format="json"),
            gmail_client.post(f"/api/posts/{self.public_post.id}/comments/", {"text": "Nice!"}, format="json"),
            gmail_client.post(
                f"/api/communities/{self.community.slug}/discussions/",
                {"title": "Test", "content": "Blocked", "discussion_type": "QUESTION"},
                format="json",
            ),
            gmail_client.post(
                f"/api/communities/{self.community.slug}/discussions/{self.discussion.id}/replies/",
                {"content": "Blocked reply"},
                format="json",
            ),
            gmail_client.post(f"/api/chat/start/{self.verified_peer.id}/", {}, format="json"),
            gmail_client.post(
                "/api/lost-found/create/",
                {"item_type": "LOST", "description": "Bottle", "location": "Library"},
                format="json",
            ),
        ]
        for resp in write_checks:
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(resp.data.get("code"), "CAMPUS_VERIFICATION_REQUIRED")

    def test_invite_code_lifecycle_and_atomic_onboarding_redemption(self):
        # Unverified user cannot list or generate invite codes
        unverified = User.objects.create_user(email="unv@gmail.com", password="password123", full_name="Unverified", is_email_verified=True)
        StudentProfile.objects.create(user=unverified, username="unv_gm", college=self.geu, course=self.course, branch=self.branch, academic_year=self.year, profile_completed=True)
        unverified_client = APIClient()
        unverified_client.force_authenticate(user=unverified)
        self.assertEqual(unverified_client.get("/api/authentication/invite/codes/").status_code, status.HTTP_403_FORBIDDEN)

        # Verified peer auto-provisions 1 code on GET
        peer_client = APIClient()
        peer_client.force_authenticate(user=self.verified_peer)
        peer_codes_res = peer_client.get("/api/authentication/invite/codes/")
        self.assertEqual(peer_codes_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(peer_codes_res.data["codes"]), 1)
        self.assertEqual(peer_codes_res.data["codes"][0]["max_uses"], 3)

        # Staff generates custom batch code with max_uses=1
        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        batch_res = admin_client.post(
            "/api/authentication/invite/codes/",
            {"code": "GEUBATCH1", "batch_label": "CSE Sec A", "max_uses": 1, "college_id": self.geu.id},
            format="json",
        )
        self.assertEqual(batch_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(batch_res.data["code"], "GEUBATCH1")

        # Expired / inactive codes fail
        expired = CampusInviteCode.objects.create(
            code="EXPIRED1", college=self.geu, created_by=self.admin, max_uses=5,
            expires_at=timezone.now() - timedelta(hours=1),
        )
        self.assertEqual(
            unverified_client.post("/api/authentication/invite/redeem/", {"code": expired.code}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Redeem GEUBATCH1 upgrades user -> unlocks posting
        redeem_res = unverified_client.post("/api/authentication/invite/redeem/", {"code": "geubatch1"}, format="json")
        self.assertEqual(redeem_res.status_code, status.HTTP_200_OK)
        self.assertEqual(redeem_res.data["user"]["verification_tier"], "INVITE_VERIFIED")
        self.assertTrue(redeem_res.data["user"]["can_participate"])

        post_res = unverified_client.post(
            "/api/posts/create/",
            {"content": "Unlocked via batch code!", "visibility": "GLOBAL"},
            format="json",
        )
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)

        # Exhausted max_uses=1 rejects second user
        second_gmail = User.objects.create_user(email="second@gmail.com", password="password123", is_email_verified=True)
        second_client = APIClient()
        second_client.force_authenticate(user=second_gmail)
        self.assertEqual(
            second_client.post("/api/authentication/invite/redeem/", {"code": "GEUBATCH1"}, format="json").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        # Passing active invite_code during /profile/complete/ atomically verifies user
        multi_code = CampusInviteCode.objects.create(code="GEUOPEN", college=self.geu, created_by=self.admin, max_uses=10)
        comp_res = second_client.post(
            "/api/profile/complete/",
            {
                "full_name": "Second Student",
                "username": "second_s",
                "college": self.geu.id,
                "course": self.course.id,
                "branch": self.branch.id,
                "academic_year": self.year.id,
                "invite_code": multi_code.code,
                "gender": "Female",
            },
            format="json",
        )
        self.assertEqual(comp_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(comp_res.data["user"]["verification_tier"], "INVITE_VERIFIED")
        self.assertTrue(comp_res.data["user"]["can_participate"])
        multi_code.refresh_from_db()
        self.assertEqual(multi_code.uses_count, 1)

    def test_microsoft_sso_first_class_login_and_in_account_linking(self):
        anon = APIClient()
        jwt_sso = _make_fake_ms_jwt("24101122@geu.ac.in", "Priya Microsoft")
        sso_res = anon.post("/api/authentication/microsoft/", {"id_token": jwt_sso}, format="json")
        self.assertEqual(sso_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sso_res.data["user"]["verification_tier"], "FULLY_VERIFIED")
        self.assertEqual(sso_res.data["user"]["verification_method"], "MICROSOFT_SSO")
        self.assertTrue(sso_res.data["user"]["can_participate"])
        self.assertEqual(sso_res.data["detected_student"]["roll_number"], "24101122")
        ms_user_id = sso_res.data["user"]["id"]

        # Gmail user links their own institutional Microsoft ID in-place (no duplicate User)
        gmail_user = User.objects.create_user(email="linked_student@gmail.com", password="password123", full_name="Linked Student", is_email_verified=True)
        StudentProfile.objects.create(
            user=gmail_user,
            username="linked_s",
            college=self.geu,
            course=self.course,
            branch=self.branch,
            academic_year=self.year,
            verification_method="INVITE_CODE",
            verified=True,
            profile_completed=True,
        )
        gmail_client = APIClient()
        gmail_client.force_authenticate(user=gmail_user)

        # Conflict check: linking an email already owned by another account returns 409
        conflict_res = gmail_client.post(
            "/api/authentication/microsoft/link/",
            {"id_token": jwt_sso},
            format="json",
        )
        self.assertEqual(conflict_res.status_code, status.HTTP_409_CONFLICT)

        # Linking an unclaimed @geu.ac.in Microsoft ID upgrades the same user seamlessly
        link_token = _make_fake_ms_jwt("24109988@geu.ac.in", "Linked Student")
        user_count_before = User.objects.count()
        link_res = gmail_client.post("/api/authentication/microsoft/link/", {"id_token": link_token}, format="json")
        self.assertEqual(link_res.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.count(), user_count_before)
        self.assertEqual(link_res.data["user"]["id"], gmail_user.id)
        self.assertEqual(link_res.data["user"]["verification_tier"], "FULLY_VERIFIED")
        self.assertEqual(link_res.data["user"]["verification_method"], "MICROSOFT_SSO")

        # Signing in again via Microsoft SSO resolves to that same linked user (not a new one)
        relogin_res = anon.post("/api/authentication/microsoft/", {"id_token": link_token}, format="json")
        self.assertEqual(relogin_res.status_code, status.HTTP_200_OK)
        self.assertEqual(relogin_res.data["user"]["id"], gmail_user.id)
        self.assertFalse(relogin_res.data["is_new_user"])
        self.assertNotEqual(ms_user_id, gmail_user.id)

    def test_honest_physical_id_upload_stays_pending_until_admin_approves(self):
        anon = APIClient()
        png_b64 = base64.b64encode(_make_png_bytes(color=(10, 20, 30))).decode("ascii")

        # 1. Direct ID Card upload login stays SEMI_VERIFIED & read-only
        id_res = anon.post(
            "/api/authentication/id-card-login/",
            {
                "image_base64": f"data:image/png;base64,{png_b64}",
                "full_name": "Neha ID Pending",
                "admission_number": "GEU24999",
                "college_id": self.geu.id,
            },
            format="json",
        )
        self.assertEqual(id_res.status_code, status.HTTP_200_OK)
        self.assertTrue(id_res.data["requires_manual_review"])
        self.assertFalse(id_res.data["user"]["can_participate"])
        self.assertEqual(id_res.data["user"]["verification_tier"], "SEMI_VERIFIED")

        pending_uid = id_res.data["user"]["id"]
        pending_client = APIClient()
        pending_client.credentials(HTTP_AUTHORIZATION=f"Bearer {id_res.data['access']}")
        self.assertEqual(
            pending_client.post("/api/posts/create/", {"content": "Should fail while pending"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

        # 2. Gmail student scanning ID stays pending and cannot view admin queue
        gmail_pending = User.objects.create_user(email="scan_user@gmail.com", password="password123", full_name="Scan User", is_email_verified=True)
        StudentProfile.objects.create(
            user=gmail_pending, username="scan_gm", college=self.geu, course=self.course,
            branch=self.branch, academic_year=self.year, profile_completed=True,
        )
        scan_client = APIClient()
        scan_client.force_authenticate(user=gmail_pending)
        png2_b64 = base64.b64encode(_make_png_bytes(color=(40, 50, 60))).decode("ascii")
        scan_res = scan_client.post(
            "/api/profile/scan-id-card/",
            {"image_base64": f"data:image/png;base64,{png2_b64}", "admission_number": "GEU24888"},
            format="json",
        )
        self.assertEqual(scan_res.status_code, status.HTTP_200_OK)
        self.assertEqual(scan_res.data["user"]["verification_tier"], "SEMI_VERIFIED")
        self.assertFalse(scan_res.data["user"]["can_participate"])
        self.assertEqual(scan_client.get("/api/profile/admin/id-cards/").status_code, status.HTTP_403_FORBIDDEN)

        # 3. Admin Audit queue surfaces pending reviews with ID thumbnail at top and approves
        admin_client = APIClient()
        admin_client.force_authenticate(user=self.admin)
        audit_list = admin_client.get("/api/profile/admin/id-cards/")
        self.assertEqual(audit_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(audit_list.data["pending_reviews"], 2)
        first_item = audit_list.data["students"][0]
        self.assertTrue(first_item["pending_review"])

        approve_res = admin_client.post(
            "/api/profile/admin/audit-user/",
            {"user_id": pending_uid, "action": "APPROVE"},
            format="json",
        )
        self.assertEqual(approve_res.status_code, status.HTTP_200_OK)
        self.assertTrue(approve_res.data["id_card_verified"])
        self.assertEqual(approve_res.data["verification_tier"], "FULLY_VERIFIED")

        # Approved student can now post + received SYSTEM notification
        self.assertEqual(
            pending_client.post("/api/posts/create/", {"content": "Approved and posting!"}, format="json").status_code,
            status.HTTP_201_CREATED,
        )
        self.assertTrue(
            Notification.objects.filter(recipient_id=pending_uid, notification_type="SYSTEM").exists()
        )

        # Flagging revokes access immediately
        flag_res = admin_client.post(
            "/api/profile/admin/audit-user/",
            {"user_id": pending_uid, "action": "FLAG_FAKE", "reason": "Blurry/fake card"},
            format="json",
        )
        self.assertEqual(flag_res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            pending_client.post("/api/posts/create/", {"content": "Should be blocked"}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

