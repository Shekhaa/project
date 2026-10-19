import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone

class Conversation(models.Model):
    DURATION_CHOICES = (
        ("10_MIN", "10 Minutes (Instant Hangout)"),
        ("1_HOUR", "1 Hour (Lunch / Canteen)"),
        ("12_HOURS", "12 Hours (Tonight Study Session)"),
        ("24_HOURS", "24 Hours (Weekend Trip / Event)"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, blank=True, default="")
    is_group = models.BooleanField(default=False)

    # Ephemeral / Self-Destructing Group Attributes
    is_ephemeral = models.BooleanField(default=False, help_text="Auto-deletes when duration expires")
    duration = models.CharField(max_length=20, choices=DURATION_CHOICES, blank=True, default="")
    purpose_tag = models.CharField(max_length=50, blank=True, default="", help_text="e.g. Trip, Canteen, Study, Gaming")
    expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        if self.is_ephemeral:
            return f"⏱️ Temporary Group: {self.name} (Tag: {self.purpose_tag})"
        if self.is_group:
            return f"Group: {self.name or str(self.id)[:8]}"
        members = self.members.select_related("user")
        names = ", ".join([m.user.email for m in members[:2]])
        return f"Chat: {names}"

    @property
    def is_expired(self):
        if self.is_ephemeral and self.expires_at:
            return timezone.now() > self.expires_at
        return False

    def get_other_member(self, current_user):
        membership = self.members.exclude(user=current_user).select_related("user", "user__profile").first()
        return membership.user if membership else None


class ConversationMember(models.Model):
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="members"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_memberships"
    )
    is_admin = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False, db_index=True, help_text="True if student deleted this conversation from their inbox")
    cleared_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when user cleared message history")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("conversation", "user")
        ordering = ["joined_at"]
        indexes = [
            models.Index(fields=["user", "is_hidden"], name="member_user_hidden_idx"),
        ]

    def __str__(self):
        return f"{self.user.email} in {self.conversation.id}"


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_chat_messages"
    )
    text = models.TextField(blank=True, default="")
    attachment = models.FileField(upload_to="chat_attachments/", blank=True, null=True)
    is_read = models.BooleanField(default=False)
    is_unsent = models.BooleanField(default=False, db_index=True, help_text="True if sender unsent message for everyone")
    unsent_at = models.DateTimeField(null=True, blank=True)
    deleted_for_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="deleted_chat_messages",
        help_text="Students who deleted this message for themselves only"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["conversation", "created_at"], name="msg_conv_created_idx"),
        ]

    def __str__(self):
        return f"{self.sender.email}: {self.text[:30]}"
