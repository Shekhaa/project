import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone

class CallSession(models.Model):
    CALL_TYPES = (
        ("AUDIO", "Voice Call"),
        ("VIDEO", "Video Call"),
    )
    STATUS_CHOICES = (
        ("RINGING", "Ringing"),
        ("ACCEPTED", "Ongoing"),
        ("REJECTED", "Declined"),
        ("MISSED", "Missed Call"),
        ("ENDED", "Completed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room_id = models.CharField(max_length=64, unique=True, db_index=True)
    caller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="outgoing_calls"
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="incoming_calls"
    )
    call_type = models.CharField(max_length=10, choices=CALL_TYPES, default="VIDEO")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="RINGING")

    # WebRTC Signaling State
    sdp_offer = models.TextField(blank=True, null=True)
    sdp_answer = models.TextField(blank=True, null=True)
    ice_candidates = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.call_type} from {self.caller.email} to {self.receiver.email} [{self.status}]"

    def end_call(self):
        self.status = "ENDED"
        self.ended_at = timezone.now()
        self.save(update_fields=["status", "ended_at"])
