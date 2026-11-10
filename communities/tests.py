import shutil
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Community, CommunityMember, Discussion, DiscussionReply, DiscussionVote, CommunityReport
from attachments.models import MediaAttachment
from attachments.services import AttachmentService
from notifications.models import Notification

User = get_user_model()


def make_dummy_webm(name="voice_note_12s_test.webm"):
    # Valid EBML header bytes + dummy payload
    return SimpleUploadedFile(name, b"\x1a\x45\xdf\xa3" + b"\x00" * 128, content_type="audio/webm")


def make_dummy_safari_voice_mp4(name="voice_note_8s_safari.mp4"):
    return SimpleUploadedFile(name, b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 128, content_type="audio/mp4")


class CommunityPlatformTests(TestCase):
    def setUp(self):
        self._media_dir = tempfile.mkdtemp(prefix="campus_test_media_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        self.client = APIClient()
        self.user1 = User.objects.create_user(
            email="student1@geu.ac.in",
            password="testpassword123",
            full_name="Aman Sharma"
        )
        self.user2 = User.objects.create_user(
            email="student2@geu.ac.in",
            password="testpassword123",
            full_name="Priya Verma"
        )
        self.community = Community.objects.create(
            name="Graphic Era Hill University",
            community_type="COLLEGE",
            description="Official College Hub"
        )
        self.member1 = CommunityMember.objects.create(
            community=self.community,
            user=self.user1,
            role="MEMBER"
        )
        self.client.force_authenticate(user=self.user1)

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def test_create_and_list_discussions(self):
        # Create discussion
        url = f"/api/communities/{self.community.slug}/discussions/"
        payload = {
            "title": "How should I prepare for Data Structures placements?",
            "content": "Can someone share the best roadmap and questions for GEHU tech placements?",
            "discussion_type": "QUESTION",
            "tags": "dsa, placements, gehu"
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["title"], payload["title"])
        self.assertEqual(res.data["discussion_type"], "QUESTION")

        # List discussions
        list_res = self.client.get(url)
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data), 1)

    def test_create_discussion_with_voice_note_and_mixed_text(self):
        # 1. Pre-upload .webm voice note via /api/attachments/upload/
        upload_res = self.client.post(
            "/api/attachments/upload/",
            {"file": make_dummy_webm(), "caption": "0:12"},
            format="multipart",
        )
        self.assertEqual(upload_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(upload_res.data["file_type"], "AUDIO")
        self.assertTrue(upload_res.data["mime_type"].startswith("audio/"))
        webm_att_id = upload_res.data["id"]

        # Create discussion with voice note only (blank content allowed when attachment_ids provided)
        disc_url = f"/api/communities/{self.community.slug}/discussions/"
        res_voice_only = self.client.post(
            disc_url,
            {
                "title": "Doubt in Operating Systems Deadlock",
                "content": "",
                "discussion_type": "QUESTION",
                "attachment_ids": [webm_att_id],
            },
            format="json",
        )
        self.assertEqual(res_voice_only.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res_voice_only.data["attachments"]), 1)
        self.assertEqual(res_voice_only.data["attachments"][0]["file_type"], "AUDIO")
        self.assertEqual(res_voice_only.data["attachments"][0]["caption"], "0:12")

        # 2. Pre-upload Safari audio/mp4 voice note and attach alongside typed text
        mp4_upload = self.client.post(
            "/api/attachments/upload/",
            {"file": make_dummy_safari_voice_mp4(), "caption": "0:08"},
            format="multipart",
        )
        self.assertEqual(mp4_upload.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mp4_upload.data["file_type"], "AUDIO")
        self.assertEqual(mp4_upload.data["mime_type"], "audio/mp4")

        res_mixed = self.client.post(
            disc_url,
            {
                "title": "CN Socket Programming Hint",
                "content": "Here is my typed note plus quick voice walkthrough:",
                "discussion_type": "RESOURCE",
                "attachment_ids": [mp4_upload.data["id"]],
            },
            format="json",
        )
        self.assertEqual(res_mixed.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_mixed.data["content"], "Here is my typed note plus quick voice walkthrough:")
        self.assertEqual(len(res_mixed.data["attachments"]), 1)

        # 3. Empty content without attachments is still rejected
        res_empty = self.client.post(
            disc_url,
            {"title": "Empty Post Attempt", "content": "   ", "discussion_type": "GENERAL"},
            format="json",
        )
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)

    def test_discussion_reply_with_voice_note_and_accepted_answer(self):
        disc = Discussion.objects.create(
            community=self.community,
            author=self.user1,
            title="What is normalization in DBMS?",
            content="Can someone explain 3NF vs BCNF simply?",
            discussion_type="QUESTION"
        )

        # User 2 replies with voice-only multipart upload
        self.client.force_authenticate(user=self.user2)
        reply_url = f"/api/communities/{self.community.slug}/discussions/{disc.id}/replies/"
        voice_reply_res = self.client.post(
            reply_url,
            {"content": "", "attachments": [make_dummy_webm("voice_note_15s_reply.webm")]},
            format="multipart",
        )
        self.assertEqual(voice_reply_res.status_code, status.HTTP_201_CREATED)
        voice_reply_id = voice_reply_res.data["id"]
        self.assertEqual(len(voice_reply_res.data["attachments"]), 1)
        self.assertEqual(voice_reply_res.data["attachments"][0]["file_type"], "AUDIO")

        # Notification should describe the voice note reply
        notif = Notification.objects.filter(recipient=self.user1, notification_type="COMMENT").latest("created_at")
        self.assertIn("voice note", notif.message.lower())

        # User 1 replies to User 2 with BOTH text and voice note (nested reply)
        self.client.force_authenticate(user=self.user1)
        mixed_nested_res = self.client.post(
            reply_url,
            {
                "content": "Follow-up clarification in audio too",
                "parent_reply_id": voice_reply_id,
                "attachments": [make_dummy_safari_voice_mp4()],
            },
            format="multipart",
        )
        self.assertEqual(mixed_nested_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mixed_nested_res.data["content"], "Follow-up clarification in audio too")
        self.assertEqual(len(mixed_nested_res.data["attachments"]), 1)

        # Detail endpoint should prefetch nested children and attachments cleanly
        detail_res = self.client.get(f"/api/communities/{self.community.slug}/discussions/{disc.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail_res.data["replies"]), 1)
        self.assertEqual(len(detail_res.data["replies"][0]["children"]), 1)
        self.assertEqual(len(detail_res.data["replies"][0]["children"][0]["attachments"]), 1)

        # Author marks voice-only reply as accepted solution
        accept_url = f"/api/communities/{self.community.slug}/discussions/{disc.id}/replies/{voice_reply_id}/accept/"
        accept_res = self.client.post(accept_url)
        self.assertEqual(accept_res.status_code, status.HTTP_200_OK)
        self.assertTrue(accept_res.data["is_solved"])

        detail_after_accept = self.client.get(f"/api/communities/{self.community.slug}/discussions/{disc.id}/")
        self.assertEqual(detail_after_accept.status_code, status.HTTP_200_OK)
        self.assertEqual(
            detail_after_accept.data["accepted_answer_snippet"]["content"],
            "🎙️ Voice Note Answer",
        )

    def test_private_community_discussion_reply_attachment_permissions(self):
        private_comm = Community.objects.create(
            name="Private Study Group",
            community_type="CUSTOM",
            description="Secret club",
            is_private=True,
        )
        CommunityMember.objects.create(community=private_comm, user=self.user1, role="OWNER")
        disc = Discussion.objects.create(
            community=private_comm,
            author=self.user1,
            title="Private Notes",
            content="Voice explanation",
        )
        reply = DiscussionReply.objects.create(discussion=disc, author=self.user1, content="")
        att = AttachmentService.create_attachment(
            make_dummy_webm(),
            user=self.user1,
            discussion_reply=reply,
        )

        # Non-member cannot download/stream private community reply voice note
        self.client.force_authenticate(user=self.user2)
        denied_res = self.client.get(f"/api/attachments/{att.id}/download/?preview=true")
        self.assertEqual(denied_res.status_code, status.HTTP_403_FORBIDDEN)

        # Enrolled member gets 200 inline audio response
        CommunityMember.objects.create(community=private_comm, user=self.user2, role="MEMBER")
        allowed_res = self.client.get(f"/api/attachments/{att.id}/download/?preview=true")
        self.assertEqual(allowed_res.status_code, status.HTTP_200_OK)
        self.assertTrue(allowed_res.get("Content-Type", "").startswith("audio/"))

    def test_discussion_reply_and_accepted_answer(self):
        # Create discussion
        disc = Discussion.objects.create(
            community=self.community,
            author=self.user1,
            title="What is normalization in DBMS?",
            content="Can someone explain 3NF vs BCNF simply?",
            discussion_type="QUESTION"
        )

        # User 2 replies
        self.client.force_authenticate(user=self.user2)
        reply_url = f"/api/communities/{self.community.slug}/discussions/{disc.id}/replies/"
        res = self.client.post(reply_url, {"content": "BCNF is a stricter form of 3NF where every determinant is a super key."}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        reply_id = res.data["id"]

        # Author marks answer as accepted
        self.client.force_authenticate(user=self.user1)
        accept_url = f"/api/communities/{self.community.slug}/discussions/{disc.id}/replies/{reply_id}/accept/"
        accept_res = self.client.post(accept_url)
        self.assertEqual(accept_res.status_code, status.HTTP_200_OK)
        self.assertTrue(accept_res.data["is_solved"])

        disc.refresh_from_db()
        self.assertTrue(disc.is_solved)
        self.assertEqual(str(disc.accepted_answer_id), reply_id)

    def test_discussion_voting(self):
        disc = Discussion.objects.create(
            community=self.community,
            author=self.user1,
            title="Important Exam Schedule",
            content="Mid-terms starting next Monday.",
            discussion_type="ANNOUNCEMENT"
        )

        vote_url = f"/api/communities/{self.community.slug}/discussions/{disc.id}/vote/"
        # Upvote
        vote_res = self.client.post(vote_url, {}, format="json")
        self.assertEqual(vote_res.status_code, status.HTTP_200_OK)
        self.assertTrue(vote_res.data["voted"])
        self.assertEqual(vote_res.data["upvotes_count"], 1)

        # Toggle vote (unvote)
        unvote_res = self.client.post(vote_url, {}, format="json")
        self.assertEqual(unvote_res.status_code, status.HTTP_200_OK)
        self.assertFalse(unvote_res.data["voted"])
        self.assertEqual(unvote_res.data["upvotes_count"], 0)

    def test_community_reporting(self):
        report_url = f"/api/communities/{self.community.slug}/reports/"
        payload = {
            "target_type": "DISCUSSION",
            "target_id": "disc-1234",
            "reason": "SPAM",
            "description": "Commercial advertisement link posted."
        }
        res = self.client.post(report_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], "PENDING")

    def test_discussion_and_reply_mentions_trigger_tag_notifications_with_exact_priority(self):
        from colleges.models import College, Course, Branch, AcademicYear
        from profiles.models import StudentProfile, UserBlock

        col = College.objects.create(name="GEU Mention Col", short_name="GEUM")
        crs = Course.objects.create(name="B.Tech", code="BTM", college=col, duration=4)
        brn = Branch.objects.create(name="CSE", code="CSEM", course=crs)
        yr = AcademicYear.objects.create(year_number=2, display_name="2nd Year", course=crs)

        StudentProfile.objects.create(
            user=self.user1, username="aman_s", admission_number="G01",
            college=col, course=crs, branch=brn, academic_year=yr, profile_completed=True
        )
        StudentProfile.objects.create(
            user=self.user2, username="priya", admission_number="G02",
            college=col, course=crs, branch=brn, academic_year=yr, profile_completed=True
        )
        user3 = User.objects.create_user(email="priyanshu@geu.ac.in", password="testpassword123", full_name="Priya Twin")
        StudentProfile.objects.create(
            user=user3, username="priya_twin", admission_number="G03",
            college=col, course=crs, branch=brn, academic_year=yr, profile_completed=True
        )

        # Create discussion mentioning @priya -> exact match only notifies user2, not user3
        url = f"/api/communities/{self.community.slug}/discussions/"
        res = self.client.post(
            url,
            {
                "title": "Need review from @priya",
                "content": "Hey @priya please check these slides.",
                "discussion_type": "GENERAL",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        mentioned_usernames = [u["username"] for u in res.data["mentioned_users"]]
        self.assertEqual(mentioned_usernames, ["priya"])
        self.assertTrue(Notification.objects.filter(recipient=self.user2, notification_type="TAG").exists())
        self.assertFalse(Notification.objects.filter(recipient=user3, notification_type="TAG").exists())

        # User2 replies mentioning @aman_s while User1 has NOT blocked User2 -> TAG notification sent
        disc_id = res.data["id"]
        self.client.force_authenticate(user=self.user2)
        reply_res = self.client.post(
            f"/api/communities/{self.community.slug}/discussions/{disc_id}/replies/",
            {"content": "Checking now @aman_s!"},
            format="json",
        )
        self.assertEqual(reply_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Notification.objects.filter(recipient=self.user1, notification_type="TAG").exists())

        # Blocked user cannot be notified via reply @mention
        UserBlock.objects.create(blocker=self.user1, blocked=user3)
        self.client.force_authenticate(user=user3)
        blocked_reply = self.client.post(
            f"/api/communities/{self.community.slug}/discussions/{disc_id}/replies/",
            {"content": "Spam ping @aman_s"},
            format="json",
        )
        self.assertEqual(blocked_reply.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(blocked_reply.data["mentioned_users"]), 0)

