from django.db import models
from django.conf import settings

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('LIKE', 'Liked your post'),
        ('COMMENT', 'Commented on your post'),
        ('REPLY', 'Replied to your comment'),
        ('TAG', 'Tagged you in a comment'),
        ('SHARE', 'Shared a post with you'),
        ('MESSAGE', 'Sent you a direct message'),
        ('ANNOUNCEMENT', 'Campus Announcement'),
    )

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        db_index=True
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications_sent',
        null=True,
        blank=True
    )
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES, db_index=True)
    title = models.CharField(max_length=255, default="")
    message = models.TextField(default="")
    data = models.JSONField(default=dict, blank=True, help_text="Metadata like post_id, conversation_id, comment_id")
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read', '-created_at'], name='notif_recip_read_idx'),
        ]

    def __str__(self):
        sender_label = self.sender.email if self.sender else "System"
        return f"{self.notification_type} -> {self.recipient.email} ({self.created_at:%Y-%m-%d %H:%M})"
