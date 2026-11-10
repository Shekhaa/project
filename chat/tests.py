import shutil
import tempfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from .models import Conversation, ConversationMember, Message
from notifications.models import Notification

User = get_user_model()


def make_dummy_webm(name="voice_note_9s_chat.webm"):
    return SimpleUploadedFile(name, b"\x1a\x45\xdf\xa3" + b"\x00" * 128, content_type="audio/webm")


class ChatVoiceNoteTests(TestCase):
    def setUp(self):
        self._media_dir = tempfile.mkdtemp(prefix="campus_chat_media_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        self.client = APIClient()
        self.user1 = User.objects.create_user(
            email="chat1@geu.ac.in",
            password="testpassword123",
            full_name="Rohan"
        )
        self.user2 = User.objects.create_user(
            email="chat2@geu.ac.in",
            password="testpassword123",
            full_name="Neha"
        )
        self.conv = Conversation.objects.create(is_group=False)
        ConversationMember.objects.create(conversation=self.conv, user=self.user1)
        ConversationMember.objects.create(conversation=self.conv, user=self.user2)
        self.client.force_authenticate(user=self.user1)

    def tearDown(self):
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def test_send_voice_note_does_not_duplicate_into_legacy_attachment_field(self):
        url = f"/api/chat/{self.conv.id}/send/"
        audio_file = make_dummy_webm()

        res = self.client.post(
            url,
            {"text": "", "attachments": [audio_file]},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Critical regression test for double voice note bug ("2 2 bhejta hai")
        self.assertIsNone(res.data["attachment"])
        self.assertEqual(len(res.data["attachments"]), 1)
        self.assertEqual(res.data["attachments"][0]["file_type"], "AUDIO")
        self.assertTrue(res.data["attachments"][0]["mime_type"].startswith("audio/"))

        # Verify database state also has exactly 1 MediaAttachment and empty legacy attachment
        msg = Message.objects.get(id=res.data["id"])
        self.assertFalse(bool(msg.attachment))
        self.assertEqual(msg.attachments.count(), 1)

        # Verify notification says voice note
        notif = Notification.objects.filter(recipient=self.user2, notification_type="MESSAGE").latest("created_at")
        self.assertIn("voice note", notif.message.lower())

        # Verify inbox last_message preview shows voice note instead of empty string
        self.client.force_authenticate(user=self.user2)
        inbox_res = self.client.get("/api/chat/inbox/")
        self.assertEqual(inbox_res.status_code, status.HTTP_200_OK)
        conv_data = inbox_res.data["results"][0]
        self.assertEqual(conv_data["last_message"]["text"], "🎙️ Voice Note")

    def test_send_mixed_text_and_voice_note(self):
        url = f"/api/chat/{self.conv.id}/send/"
        audio_file = make_dummy_webm("voice_note_5s_mix.webm")

        res = self.client.post(
            url,
            {"text": "Listen to this assignment summary", "attachments": [audio_file]},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data["attachment"])
        self.assertEqual(len(res.data["attachments"]), 1)
        self.assertEqual(res.data["text"], "Listen to this assignment summary")

    def test_pending_message_request_exposes_flag_and_blocks_followup_until_accepted(self):
        sender = User.objects.create_user(
            email="req_sender@geu.ac.in",
            password="testpassword123",
            full_name="Abhishek",
        )
        recipient = User.objects.create_user(
            email="req_recip@geu.ac.in",
            password="testpassword123",
            full_name="Priya",
        )

        self.client.force_authenticate(user=sender)
        start_res = self.client.post(f"/api/chat/start/{recipient.id}/")
        self.assertEqual(start_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(start_res.data["status"], "MESSAGE_REQUEST_SENT")
        conv_data = start_res.data["conversation"]
        self.assertTrue(conv_data["is_request_pending"])

        # Inbox for sender also exposes is_request_pending=True
        inbox_res = self.client.get("/api/chat/inbox/")
        self.assertEqual(inbox_res.status_code, status.HTTP_200_OK)
        self.assertTrue(inbox_res.data["results"][0]["is_request_pending"])

        # Sending a follow-up voice note before acceptance returns 403 MESSAGE_REQUEST_PENDING
        send_res = self.client.post(
            f"/api/chat/{conv_data['id']}/send/",
            {"text": "", "attachments": [make_dummy_webm()]},
            format="multipart",
        )
        self.assertEqual(send_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(send_res.data["status"], "MESSAGE_REQUEST_PENDING")

        # Recipient accepts request -> is_request_pending flips False and voice note succeeds
        self.client.force_authenticate(user=recipient)
        req_id = start_res.data["message_request_id"]
        accept_res = self.client.post(f"/api/chat/message-requests/{req_id}/accept/")
        self.assertEqual(accept_res.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=sender)
        inbox_after = self.client.get("/api/chat/inbox/")
        self.assertFalse(inbox_after.data["results"][0]["is_request_pending"])

        followup_res = self.client.post(
            f"/api/chat/{conv_data['id']}/send/",
            {"text": "", "attachments": [make_dummy_webm()]},
            format="multipart",
        )
        self.assertEqual(followup_res.status_code, status.HTTP_201_CREATED)
