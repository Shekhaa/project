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
