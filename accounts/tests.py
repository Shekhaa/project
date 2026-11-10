import io
import shutil
import tempfile
from PIL import Image as PILImage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from colleges.models import College, Course, Branch
from profiles.models import StudentProfile, UserBlock

User = get_user_model()


class DirectorySearchTests(TestCase):
    def setUp(self):
        self._media_dir = tempfile.mkdtemp(prefix="campus_acct_test_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        from colleges.models import AcademicYear

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
