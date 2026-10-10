import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone

class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="devices"
    )
    device_uuid = models.CharField(max_length=255, unique=True)
    device_name = models.CharField(max_length=100)
    manufacturer = models.CharField(max_length=100, blank=True, null=True)
    model = models.CharField(max_length=100, blank=True, null=True)
    os = models.CharField(max_length=50, blank=True, null=True)
    os_version = models.CharField(max_length=50, blank=True, null=True)
    browser = models.CharField(max_length=100, blank=True, null=True)
    app_version = models.CharField(max_length=30, blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    last_login = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_login"]

    def __str__(self):
        return f"{self.user.email} - {self.device_name} ({'Primary' if self.is_primary else 'Secondary'})"


class DeviceLinkChallenge(models.Model):
    """
    Manages short-lived QR code linking challenges for web client logins,
    mimicking the secure WhatsApp Web linking pattern.
    """
    STATUS_CHOICES = (
        ("PENDING", "Pending Mobile Scan"),
        ("AUTHORIZED", "Authorized by Mobile"),
        ("EXPIRED", "Expired"),
        ("CONSUMED", "Session Established"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    challenge_token = models.CharField(max_length=64, unique=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qr_link_challenges"
    )
    web_device_uuid = models.CharField(max_length=255, blank=True, default="")
    web_browser_info = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at
