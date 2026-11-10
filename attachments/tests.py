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


class MediaUploadLimitsAndMetadataTests(TestCase):
    def setUp(self):
        import tempfile
        from django.test import override_settings

        self._media_dir = tempfile.mkdtemp(prefix="campus_att_test_")
        self._override = override_settings(MEDIA_ROOT=self._media_dir)
        self._override.enable()

        self.user = User.objects.create_user(
            email="media_tester@geu.ac.in", password="password123", full_name="Media Tester"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        import shutil
        self._override.disable()
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def test_document_over_20mb_rejected_with_split_guidance(self):
        from attachments.services import MAX_DOC_SIZE

        oversized_bytes = b"%PDF-1.4\n" + (b"X" * (MAX_DOC_SIZE + 1 - len(b"%PDF-1.4\n")))
        oversized_pdf = SimpleUploadedFile("huge_notes.pdf", oversized_bytes, content_type="application/pdf")

        with self.assertRaises(Exception) as ctx:
            AttachmentService.create_attachment(oversized_pdf, user=self.user)
        self.assertIn("20 mb", str(ctx.exception).lower())
        self.assertIn("try uploading 2 different", str(ctx.exception).lower())

        # API upload endpoint returns HTTP 400 with the same guidance
        oversized_pdf.seek(0)
        res = self.client.post("/api/attachments/upload/", {"file": oversized_pdf}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("20 mb", str(res.data.get("error", "")).lower())
        self.assertIn("try uploading 2 different", str(res.data.get("error", "")).lower())

    def test_document_within_20mb_preserved_untouched_without_quality_compression(self):
        from attachments.services import MAX_DOC_SIZE

        raw_pdf_bytes = b"%PDF-1.4\n%exact-binary-check\n" + (b"A" * 1024) + b"\n%%EOF"
        doc_file = SimpleUploadedFile("exact_notes.pdf", raw_pdf_bytes, content_type="application/pdf")
        res = self.client.post("/api/attachments/upload/", {"file": doc_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["file_type"], "DOCUMENT")
        self.assertEqual(res.data["file_size"], len(raw_pdf_bytes))

        att = MediaAttachment.objects.get(id=res.data["id"])
        with open(att.file.path, "rb") as stored_fp:
            self.assertEqual(stored_fp.read(), raw_pdf_bytes)

        # Exact 20 MB boundary file is allowed
        boundary_bytes = b"%PDF-1.4\n" + (b"B" * (MAX_DOC_SIZE - len(b"%PDF-1.4\n")))
        boundary_pdf = SimpleUploadedFile("boundary_20mb.pdf", boundary_bytes, content_type="application/pdf")
        res_ok = self.client.post("/api/attachments/upload/", {"file": boundary_pdf}, format="multipart")
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data["file_size"], MAX_DOC_SIZE)

    def test_video_mp4_upload_accepted_as_video(self):
        mp4_payload = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + (b"\x00" * 256)
        video_file = SimpleUploadedFile("campus_reel.mp4", mp4_payload, content_type="video/mp4")
        res = self.client.post("/api/attachments/upload/", {"file": video_file}, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["file_type"], "VIDEO")
        self.assertEqual(res.data["mime_type"], "video/mp4")

    def test_portrait_9_16_and_4_5_image_dimensions_preserved_in_metadata(self):
        for w, h, name in [(540, 960, "story_9_16.jpg"), (400, 500, "portrait_4_5.jpg")]:
            buf = io.BytesIO()
            PILImage.new("RGB", (w, h), color=(30, 80, 160)).save(buf, "JPEG")
            buf.seek(0)
            img_file = SimpleUploadedFile(name, buf.read(), content_type="image/jpeg")
            res = self.client.post("/api/attachments/upload/", {"file": img_file}, format="multipart")
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(res.data["file_type"], "IMAGE")
            self.assertEqual(res.data["image_width"], w)
            self.assertEqual(res.data["image_height"], h)

