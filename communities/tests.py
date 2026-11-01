from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Community, CommunityMember, Discussion, DiscussionReply, DiscussionVote, CommunityReport

User = get_user_model()

class CommunityPlatformTests(TestCase):
    def setUp(self):
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
        disc_id = res.data["id"]
        self.assertEqual(res.data["title"], payload["title"])
        self.assertEqual(res.data["discussion_type"], "QUESTION")

        # List discussions
        list_res = self.client.get(url)
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data), 1)

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
