import uuid
from django.db import models
from django.utils import timezone

class OTP(models.Model):
    PURPOSE_CHOICES = (
        ("EMAIL_LOGIN", "Email Login / Registration"),
        ("PHONE_VERIFY", "Phone Verification"),
        ("PASSWORD_RESET", "Password Reset"),
        ("DEVICE_CHANGE", "Device Change Verification"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    destination = models.CharField(max_length=255, db_index=True, help_text="Email address or phone number")
    otp = models.CharField(max_length=6)
    magic_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, db_index=True)
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES, default="EMAIL_LOGIN")
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    is_used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["destination", "purpose", "is_used"]),
        ]

    def __str__(self):
        return f"{self.destination} [{self.purpose}] ({'Used' if self.is_used else 'Active'})"

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def is_valid(self):
        return (not self.is_used) and (not self.is_expired) and (self.attempts < self.max_attempts)

    def record_attempt(self):
        self.attempts += 1
        if self.attempts >= self.max_attempts:
            self.is_used = True  # Invalidate after max attempts reached
        self.save(update_fields=["attempts", "is_used"])

    def mark_consumed(self):
        self.is_used = True
        self.save(update_fields=["is_used"])
