import io
from PIL import Image as PILImage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from attachments.models import MediaAttachment
from attachments.services import AttachmentService
from communities.models import Community, CommunityMember
from chat.models import Conversation, ConversationMember, Message
from posts.models import Post

User = get_user_model()

def create_test_image():
    file = io.BytesIO()
    img = PILImage.new("RGB", (200, 150), color=(73, 109, 137))
    img.save(file, "JPEG")
    file.seek(0)
    return SimpleUploadedFile("test_photo.jpg", file.read(), content_type="image/jpeg")

def create_test_pdf():
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF"
    return SimpleUploadedFile("syllabus.pdf", pdf_content, content_type="application/pdf")

def create_invalid_file():
    exe_content = b"MZ\x90\x00\x03\x00\x00\x00"
    return SimpleUploadedFile("malicious.exe", exe_content, content_type="application/x-dosexec")

class AttachmentTestCase(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(email="student1@campus.edu", password="password123", full_name="Student One")
        self.user2 = User.objects.create_user(email="student2@campus.edu", password="password123", full_name="Student Two")
        self.client = APIClient()

    def test_image_attachment_creation(self):
        img_file = create_test_image()
        attachment = AttachmentService.create_attachment(img_file, user=self.user1)
        self.assertEqual(attachment.file_type, "IMAGE")
        self.assertEqual(attachment.image_width, 200)
        self.assertEqual(attachment.image_height, 150)
        self.assertEqual(attachment.file_extension, "jpg")
        self.assertTrue(attachment.file_size > 0)

    def test_document_attachment_creation(self):
        pdf_file = create_test_pdf()
        attachment = AttachmentService.create_attachment(pdf_file, user=self.user1)
        self.assertEqual(attachment.file_type, "DOCUMENT")
        self.assertEqual(attachment.file_extension, "pdf")
        self.assertTrue(attachment.file_size > 0)
        self.assertIn("B", attachment.file_size_formatted)

    def test_invalid_extension_rejected(self):
        bad_file = create_invalid_file()
        with self.assertRaises(Exception):
            AttachmentService.create_attachment(bad_file, user=self.user1)

    def test_chat_message_attachment_and_download_security(self):
        # Create a conversation between user1 and user2
        conv = Conversation.objects.create(is_group=False)
        ConversationMember.objects.create(conversation=conv, user=self.user1)
        ConversationMember.objects.create(conversation=conv, user=self.user2)

        msg = Message.objects.create(conversation=conv, sender=self.user1, text="Here is the syllabus")
        pdf_file = create_test_pdf()
        attachment = AttachmentService.create_attachment(pdf_file, user=self.user1, message=msg)

        # User2 (conversation participant) should have access to download
        self.client.force_authenticate(user=self.user2)
        response = self.client.get(f"/api/attachments/{attachment.id}/download/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Stranger user (not in conversation) should be denied 403
        stranger = User.objects.create_user(email="stranger@campus.edu", password="password123", full_name="Stranger")
        self.client.force_authenticate(user=stranger)
        response = self.client.get(f"/api/attachments/{attachment.id}/download/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
