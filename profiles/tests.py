from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from colleges.models import College, Course, Branch, AcademicYear
from profiles.models import StudentProfile, Connection, Follow, UserBlock
from chat.models import Conversation, MessageRequest
from posts.models import Post

User = get_user_model()

class SocialGraphAndPrivacyTests(TestCase):
    def setUp(self):
        self.college = College.objects.create(name="Graphic Era University", short_name="GEU")
        self.course = Course.objects.create(name="B.Tech", code="BT", college=self.college, duration=4)
        self.branch = Branch.objects.create(name="CSE", code="CSE", course=self.course)
        self.year = AcademicYear.objects.create(year_number=2, display_name="2nd Year", course=self.course)

        # Student A
        self.user_a = User.objects.create_user(email="alice@geu.ac.in", password="password123", full_name="Alice Sharma")
        self.prof_a = StudentProfile.objects.create(
            user=self.user_a, username="alice_s", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU001",
            is_private_account=False, messaging_preference="EVERYONE", profile_completed=True
        )

        # Student B (Private account)
        self.user_b = User.objects.create_user(email="bob@geu.ac.in", password="password123", full_name="Bob Verma")
        self.prof_b = StudentProfile.objects.create(
            user=self.user_b, username="bob_v", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU002",
            is_private_account=True, messaging_preference="EVERYONE", profile_completed=True
        )

        # Student C
        self.user_c = User.objects.create_user(email="charlie@geu.ac.in", password="password123", full_name="Charlie Gupta")
        self.prof_c = StudentProfile.objects.create(
            user=self.user_c, username="charlie_g", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU003",
            is_private_account=False, messaging_preference="EVERYONE", profile_completed=True
        )

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)

        self.client_c = APIClient()
        self.client_c.force_authenticate(user=self.user_c)

    def test_connection_flow(self):
        # Alice requests to connect with Bob
        res = self.client_a.post("/api/profile/connections/request/", {"user_id": self.user_b.id})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], "REQUEST_SENT")

        # Bob views received connection requests
        res = self.client_b.get("/api/profile/connections/?tab=received")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)

        # Bob accepts
        res = self.client_b.post(f"/api/profile/connections/{self.user_a.id}/respond/", {"action": "ACCEPT"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "CONNECTED")
        self.assertTrue(Connection.are_connected(self.user_a, self.user_b))

    def test_follow_private_account_flow(self):
        # Bob is private; Alice requests to follow Bob
        res = self.client_a.post(f"/api/profile/follow/{self.user_b.id}/")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["follow_status"], "REQUEST_SENT")
        self.assertTrue(res.data["is_private"])

        # Bob views follow requests
        res = self.client_b.get("/api/profile/follow/requests/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        req_id = res.data["results"][0]["id"]

        # Bob accepts follow request
        res = self.client_b.post(f"/api/profile/follow/requests/{req_id}/respond/", {"action": "ACCEPT"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(Follow.is_following(self.user_a, self.user_b))

    def test_safe_messaging_and_message_request(self):
        # Alice (not connected with Charlie) sends a direct message
        res = self.client_a.post(f"/api/chat/start/{self.user_c.id}/", {"message": "Hey Charlie! Can I borrow your notes?"})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["status"], "MESSAGE_REQUEST_SENT")

        # Charlie checks inbox: pending message request should NOT be in primary inbox
        res = self.client_c.get("/api/chat/inbox/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should have 0 primary conversations and 1 pending_requests_count
        self.assertEqual(res.data["pending_requests_count"], 1)
        self.assertEqual(len(res.data["results"]), 0)

        # Charlie checks message requests
        res = self.client_c.get("/api/chat/message-requests/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        req_id = res.data["results"][0]["id"]

        # Charlie accepts message request
        res = self.client_c.post(f"/api/chat/message-requests/{req_id}/accept/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Now conversation is unlocked in Charlie's inbox
        res = self.client_c.get("/api/chat/inbox/")
        self.assertEqual(len(res.data["results"]), 1)

    def test_post_privacy_and_shareable_permalink(self):
        # Alice creates a post for FOLLOWERS only
        post_followers = Post.objects.create(
            author=self.user_a, content="Secret study notes for my followers",
            visibility="FOLLOWERS"
        )

        # Charlie (not following Alice) requests permalink /api/posts/<id>/
        res = self.client_c.get(f"/api/posts/{post_followers.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(res.data["is_private"])
        # Ensure content is NOT leaked
        self.assertNotIn("Secret study notes", str(res.data))
        # Ensure safe author card is returned
        self.assertEqual(res.data["author"]["username"], "alice_s")

        # Charlie follows Alice (Alice is public, so immediately accepted)
        self.client_c.post(f"/api/profile/follow/{self.user_a.id}/")

        # Now Charlie can view the post!
        res = self.client_c.get(f"/api/posts/{post_followers.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["content"], "Secret study notes for my followers")

    def test_credibility_endorsement_flow(self):
        # Alice endorses Bob
        res = self.client_a.post(f"/api/profile/{self.user_b.id}/endorse/")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["endorsed"])
        self.assertEqual(res.data["credibility_score"], 1)

        # Alice toggles endorsement (removes it)
        res = self.client_a.post(f"/api/profile/{self.user_b.id}/endorse/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["endorsed"])
        self.assertEqual(res.data["credibility_score"], 0)

        # Self endorsement is prevented
        res = self.client_a.post(f"/api/profile/{self.user_a.id}/endorse/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Blocked user cannot endorse
        UserBlock.objects.create(blocker=self.user_b, blocked=self.user_a)
        res = self.client_a.post(f"/api/profile/{self.user_b.id}/endorse/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_posts_view_and_privacy(self):
        # Alice creates a GLOBAL post and an ONLY_ME post
        post_public = Post.objects.create(
            author=self.user_a, content="Public campus tip", visibility="GLOBAL"
        )
        post_private = Post.objects.create(
            author=self.user_a, content="Personal private note", visibility="ONLY_ME"
        )

        # Alice views her own posts: both are returned
        res = self.client_a.get(f"/api/posts/user/{self.user_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        post_ids = [p["id"] for p in res.data["results"]]
        self.assertIn(post_public.id, post_ids)
        self.assertIn(post_private.id, post_ids)

        # Charlie views Alice's posts: ONLY_ME is excluded
        res = self.client_c.get(f"/api/posts/user/{self.user_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        charlie_seen_ids = [p["id"] for p in res.data["results"]]
        self.assertIn(post_public.id, charlie_seen_ids)
        self.assertNotIn(post_private.id, charlie_seen_ids)

    def test_profile_detail_sensitive_data_protection(self):
        # Charlie views Alice's profile: email and admission_number MUST be empty
        res = self.client_c.get(f"/api/profile/{self.user_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("email"), "")
        self.assertEqual(res.data.get("admission_number"), "")

        # Alice views her own profile: email and admission_number are present
        res = self.client_a.get(f"/api/profile/{self.user_a.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("email"), self.user_a.email)
        self.assertEqual(res.data.get("admission_number"), self.prof_a.admission_number)


class AvatarUploadAndVisibilityTests(TestCase):
    def setUp(self):
        import tempfile
        from django.test import override_settings

        self._media_dir = tempfile.mkdtemp(prefix="campus_prof_media_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        self.college = College.objects.create(name="Graphic Era University", short_name="GEU")
        self.course = Course.objects.create(name="B.Tech", code="BT", college=self.college, duration=4)
        self.branch = Branch.objects.create(name="CSE", code="CSE", course=self.course)
        self.year = AcademicYear.objects.create(year_number=2, display_name="2nd Year", course=self.course)

        self.alice = User.objects.create_user(email="alice_ava@geu.ac.in", password="password123", full_name="Alice Avatar")
        self.prof_alice = StudentProfile.objects.create(
            user=self.alice, username="alice_ava", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU901",
            is_private_account=False, profile_completed=True
        )

        self.bob = User.objects.create_user(email="bob_ava@geu.ac.in", password="password123", full_name="Bob Viewer")
        self.prof_bob = StudentProfile.objects.create(
            user=self.bob, username="bob_ava", college=self.college, course=self.course,
            branch=self.branch, academic_year=self.year, admission_number="GEU902",
            is_private_account=False, profile_completed=True
        )

        self.client_alice = APIClient()
        self.client_alice.force_authenticate(user=self.alice)
        self.client_bob = APIClient()
        self.client_bob.force_authenticate(user=self.bob)

    def tearDown(self):
        import shutil
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def _make_png_data_url(self, width=800, height=600, color=(94, 106, 210, 255)):
        import io, base64
        from PIL import Image as PILImage

        buf = io.BytesIO()
        PILImage.new("RGBA", (width, height), color=color).save(buf, "PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"

    def test_base64_avatar_upload_resizes_and_is_visible_across_all_surfaces(self):
        from communities.models import Community, CommunityMember, Discussion
        from chat.models import Conversation, ConversationMember
        from posts.models import Comment
        from notifications.views import create_notification

        # 1. Alice uploads RGBA PNG base64 avatar -> normalized to <=512px JPEG
        res = self.client_alice.patch(
            "/api/profile/edit/",
            {"profile_picture_base64": self._make_png_data_url()},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        pic_url = res.data["profile"]["profile_picture"]
        self.assertIsNotNone(pic_url)
        self.assertIn(f"avatar_{self.alice.id}_", pic_url)
        self.assertEqual(res.data["user"]["profile_picture"], pic_url)

        # Verify stored avatar on disk was resized to max 512px
        from PIL import Image as PILImage
        self.prof_alice.refresh_from_db()
        with PILImage.open(self.prof_alice.profile_picture.path) as img:
            self.assertEqual(img.size, (512, 384))
            self.assertEqual(img.format, "JPEG")

        # 2. Bob views Alice's public profile -> sees exact same resolved URL
        prof_res = self.client_bob.get(f"/api/profile/{self.alice.id}/")
        self.assertEqual(prof_res.status_code, status.HTTP_200_OK)
        self.assertEqual(prof_res.data["profile_picture"], pic_url)

        # 3. Bob searches directory for Alice -> sees Alice's avatar & profile_picture
        search_res = self.client_bob.get("/api/authentication/users/search/?q=alice_ava")
        self.assertEqual(search_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(search_res.data["results"]), 1)
        self.assertEqual(search_res.data["results"][0]["avatar"], pic_url)
        self.assertEqual(search_res.data["results"][0]["profile_picture"], pic_url)

        # 4. Alice's post and comment expose author_avatar for Bob
        post = Post.objects.create(author=self.alice, content="Look at my new profile photo!", visibility="GLOBAL")
        Comment.objects.create(post=post, user=self.alice, text="First comment!")

        feed_res = self.client_bob.get("/api/posts/feed/?scope=GLOBAL")
        self.assertEqual(feed_res.status_code, status.HTTP_200_OK)
        post_data = next(p for p in feed_res.data["results"] if p["id"] == post.id)
        self.assertEqual(post_data["author_avatar"], pic_url)

        comm_res = self.client_bob.get(f"/api/posts/{post.id}/comments/")
        self.assertEqual(comm_res.status_code, status.HTTP_200_OK)
        self.assertEqual(comm_res.data[0]["author_avatar"], pic_url)

        # 5. Community discussion exposes Alice's author_avatar
        community = Community.objects.create(name="GEU Coding Club", community_type="CUSTOM", description="Club")
        CommunityMember.objects.create(community=community, user=self.alice, role="MEMBER")
        CommunityMember.objects.create(community=community, user=self.bob, role="MEMBER")
        disc = Discussion.objects.create(community=community, author=self.alice, title="Hello!", content="Avatar check")
        disc_res = self.client_bob.get(f"/api/communities/{community.slug}/discussions/{disc.id}/")
        self.assertEqual(disc_res.status_code, status.HTTP_200_OK)
        self.assertEqual(disc_res.data["author_avatar"], pic_url)

        # 6. Chat inbox exposes Alice's avatar on recipient card
        from chat.models import Message
        conv = Conversation.objects.create(is_group=False)
        ConversationMember.objects.create(conversation=conv, user=self.alice)
        ConversationMember.objects.create(conversation=conv, user=self.bob)
        Message.objects.create(conversation=conv, sender=self.alice, text="Hey Bob!")
        inbox_res = self.client_bob.get("/api/chat/inbox/")
        self.assertEqual(inbox_res.status_code, status.HTTP_200_OK)
        recipient_data = inbox_res.data["results"][0]["recipient"]
        self.assertEqual(recipient_data["avatar"], pic_url)
        self.assertEqual(recipient_data["profile_picture"], pic_url)

        # 7. Notification from Alice exposes sender_avatar
        create_notification(recipient=self.bob, sender=self.alice, notification_type="FOLLOW", title="Followed", message="Hi")
        notif_res = self.client_bob.get("/api/notifications/")
        self.assertEqual(notif_res.status_code, status.HTTP_200_OK)
        self.assertEqual(notif_res.data["results"][0]["sender_avatar"], pic_url)

