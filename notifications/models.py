from django.db import models
from django.contrib.auth.models import User

class Notification(models.Model):
    NOTIFICATION_TYPES = (
        ('like', 'Liked your post'),
        ('comment', 'Commented on your post'),
        ('follow', 'Started following you'),
        ('message', 'Sent you a direct message'),
    )

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications_sent')
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    post = models.ForeignKey('posts.Post', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.sender.username} - {self.notification_type} -> {self.recipient.username}"
