import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from colleges.models import College

class LostFoundPost(models.Model):
    ITEM_TYPES = (
        ("LOST", "Kho Gaya (Lost)"),
        ("FOUND", "Mila Hai (Found)"),
    )
    STATUS_CHOICES = (
        ("OPEN", "Active / Unresolved"),
        ("RESOLVED", "Claimed / Returned"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    college = models.ForeignKey(
        College,
        on_delete=models.CASCADE,
        related_name="lost_found_items"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="lost_found_posts"
    )
    item_type = models.CharField(max_length=10, choices=ITEM_TYPES, default="FOUND")
    description = models.TextField(help_text="Direct descriptive message (e.g. Black Boat earbuds in CS Lab 3)")
    location = models.CharField(max_length=255, help_text="Written location where it was lost or found")
    image = models.ImageField(upload_to="lost_found/", blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="OPEN")
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.item_type}] {self.description[:40]} @ {self.location}"

    def mark_resolved(self):
        self.status = "RESOLVED"
        self.resolved_at = timezone.now()
        self.save(update_fields=["status", "resolved_at"])
