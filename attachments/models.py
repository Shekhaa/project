import uuid
import os
from django.db import models
from django.conf import settings

def attachment_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    random_filename = f"{uuid.uuid4().hex}{ext}"
    subfolder = "images" if instance.file_type == "IMAGE" else "documents"
    return os.path.join("attachments", subfolder, random_filename)

class MediaAttachment(models.Model):
    TYPE_CHOICES = (
        ("IMAGE", "Image / Photo"),
        ("DOCUMENT", "Academic Document"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Ownership (belonging to a Community Post, Chat Message, OR Community Discussion)
    post = models.ForeignKey(
        "posts.Post",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments"
    )
    message = models.ForeignKey(
        "chat.Message",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments"
    )
    discussion = models.ForeignKey(
        "communities.Discussion",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments"
    )
    
    # Physical File & Names
    file = models.FileField(upload_to=attachment_upload_path)
    file_name = models.CharField(max_length=255, help_text="Original sanitized filename")
    stored_name = models.CharField(max_length=255, blank=True, default="")
    
    # Metadata
    file_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="IMAGE")
    file_extension = models.CharField(max_length=20, blank=True, default="")
    mime_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.BigIntegerField(default=0, help_text="File size in bytes")
    file_size_formatted = models.CharField(max_length=30, blank=True, default="")
    
    # Dimensions (for images)
    image_width = models.PositiveIntegerField(null=True, blank=True)
    image_height = models.PositiveIntegerField(null=True, blank=True)
    
    # Optional Caption & Presentation
    caption = models.CharField(max_length=500, blank=True, default="")
    order = models.PositiveSmallIntegerField(default=0)
    
    # Audit & Security
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media_attachments"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["order", "created_at"]
        indexes = [
            models.Index(fields=["post", "order"]),
            models.Index(fields=["message", "order"]),
            models.Index(fields=["discussion", "order"]),
            models.Index(fields=["uploaded_by", "-created_at"]),
        ]

    def __str__(self):
        owner = f"Post #{self.post_id}" if self.post_id else f"Message #{self.message_id}" if self.message_id else f"Discussion #{self.discussion_id}"
        return f"{self.file_name} ({self.file_type}) -> {owner}"
