import shutil
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from attachments.services import MAX_DOC_SIZE
from notifications.models import Notification
from profiles.models import StudentProfile, UserBlock
from .models import Post

User = get_user_model()


class PostMediaAndMentionTests(TestCase):
    def setUp(self):
        self._media_dir = tempfile.mkdtemp(prefix="campus_posts_test_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        from colleges.models import College, Course, Branch, AcademicYear

        col = College.objects.create(name="GEU Posts Test", short_name="GEUP")
        crs = Course.objects.create(name="B.Tech", code="BTP", college=col, duration=4)
        brn = Branch.objects.create(name="CSE", code="CSEP", course=crs)
        yr = AcademicYear.objects.create(year_number=2, display_name="2nd Year", course=crs)

        self.author = User.objects.create_user(
            email="author@geu.ac.in", password="password123", full_name="Ananya Joshi"
        )
        StudentProfile.objects.create(
            user=self.author, username="ananya_j", admission_number="G101",
            college=col, course=crs, branch=brn, academic_year=yr, profile_completed=True
        )

        self.alex = User.objects.create_user(
            email="alex@geu.ac.in", password="password123", full_name="Alex Kumar"
        )
        StudentProfile.objects.create(
            user=self.alex, username="alex", admission_number="G102",
            college=col, course=crs, branch=brn, academic_year=yr, profile_completed=True
        )

        self.alexander = User.objects.create_user(
            email="alexander@geu.ac.in", password="password123", full_name="Alexander Roy"
        )
        StudentProfile.objects.create(
            user=self.alexander, username="alexander_r", admission_number="G103",
            college=col, course=crs, branch=brn, academic_year=yr, profile_completed=True
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.author)

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def test_post_create_rejects_oversized_20mb_document_without_orphan_post(self):
        oversized_bytes = b"%PDF-1.4\n" + (b"Z" * (MAX_DOC_SIZE + 10 - len(b"%PDF-1.4\n")))
        big_pdf = SimpleUploadedFile("too_big.pdf", oversized_bytes, content_type="application/pdf")

        res = self.client.post(
            "/api/posts/create/",
            {
                "content": "Trying oversized syllabus PDF",
                "visibility": "GLOBAL",
                "attachments": [big_pdf],
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("20 mb", str(res.data.get("error", "")).lower())
        self.assertIn("try uploading 2 different", str(res.data.get("error", "")).lower())
        self.assertEqual(Post.objects.count(), 0)

        # Valid 4 MB PDF (>2.5MB Django TemporaryUploadedFile threshold, <=20MB limit) uploads cleanly
        valid_4mb_bytes = b"%PDF-1.4\n" + (b"M" * (4 * 1024 * 1024))
        ok_pdf = SimpleUploadedFile("lecture_4mb.pdf", valid_4mb_bytes, content_type="application/pdf")
        res_ok = self.client.post(
            "/api/posts/create/",
            {
                "content": "Valid 4MB PDF notes",
                "visibility": "GLOBAL",
                "attachments": [ok_pdf],
            },
            format="multipart",
        )
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data["media_type"], "DOCUMENT")
        self.assertEqual(res_ok.data["attachments"][0]["file_size"], len(valid_4mb_bytes))

    def test_post_create_accepts_mp4_video_attachment(self):
        mp4_payload = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + (b"\x00" * 512)
        video_file = SimpleUploadedFile("demo_clip.mp4", mp4_payload, content_type="video/mp4")

        res = self.client.post(
            "/api/posts/create/",
            {
                "content": "Watch @alex in the fest clip!",
                "visibility": "GLOBAL",
                "attachments": [video_file],
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["media_type"], "VIDEO")
        self.assertEqual(len(res.data["attachments"]), 1)
        self.assertEqual(res.data["attachments"][0]["file_type"], "VIDEO")

        # Exact @alex username notified; Alex substring user @alexander_r not spuriously notified
        self.assertTrue(Notification.objects.filter(recipient=self.alex, notification_type="TAG").exists())
        self.assertFalse(Notification.objects.filter(recipient=self.alexander, notification_type="TAG").exists())

    def test_comment_mentions_prioritize_exact_username_and_respect_blocks(self):
        post = Post.objects.create(author=self.author, content="Study group?", visibility="GLOBAL")

        res = self.client.post(
            f"/api/posts/{post.id}/comments/",
            {"text": "Looping in @alex!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(recipient=self.alex, notification_type="TAG").count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.alexander, notification_type="TAG").count(), 0)

        # Blocked user cannot generate TAG notification on comment
        UserBlock.objects.create(blocker=self.alexander, blocked=self.author)
        res_blocked = self.client.post(
            f"/api/posts/{post.id}/comments/",
            {"text": "Ping @alexander_r"},
            format="json",
        )
        self.assertEqual(res_blocked.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Notification.objects.filter(recipient=self.alexander, notification_type="TAG").count(), 0)

    def test_poll_creation_and_voting(self):
        import json
        payload = {
            "content": "Check out this campus poll!",
            "visibility": "COLLEGE",
            "poll_question": "Tomorrow 8:45 AM Lab: Attendance mandatory?",
            "poll_options": json.dumps(["Yes, attend", "No, mass bunk", "First 30 mins"]),
        }
        res = self.client.post("/api/posts/create/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertIn("poll", data)
        poll_data = data["poll"]
        self.assertIsNotNone(poll_data)
        self.assertEqual(poll_data["question"], "Tomorrow 8:45 AM Lab: Attendance mandatory?")
        self.assertEqual(len(poll_data["options"]), 3)
        self.assertEqual(poll_data["total_votes"], 0)
        self.assertFalse(poll_data["has_voted"])

        post_id = data["id"]
        option_id = poll_data["options"][1]["id"]

        # Alex votes on option 2
        alex_client = APIClient()
        alex_client.force_authenticate(user=self.alex)
        vote_res = alex_client.post(f"/api/posts/{post_id}/poll/vote/", {"option_id": option_id}, format="json")
        self.assertEqual(vote_res.status_code, status.HTTP_200_OK)
        v_data = vote_res.json()
        self.assertEqual(v_data["total_votes"], 1)
        self.assertTrue(v_data["has_voted"])
        self.assertEqual(v_data["user_voted_option_id"], option_id)
        opt2 = next(o for o in v_data["options"] if o["id"] == option_id)
        self.assertEqual(opt2["votes_count"], 1)
        self.assertEqual(opt2["percentage"], 100.0)

        # Author receives notification of the vote
        self.assertTrue(Notification.objects.filter(recipient=self.author, notification_type="ACCEPTED_ANSWER").exists())

