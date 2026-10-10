from django.db import models
from django.conf import settings
from django.utils.text import slugify

class Community(models.Model):
    COMMUNITY_TYPES = [
        ("COLLEGE", "College"),
        ("COURSE", "Course"),
        ("BRANCH", "Branch"),
        ("YEAR", "Academic Year"),
        ("SECTION", "Section"),
        ("CLUB", "Student Club / Society"),
        ("CUSTOM", "Custom"),
    ]

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    community_type = models.CharField(max_length=20, choices=COMMUNITY_TYPES)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="community_images/", blank=True, null=True)
    is_private = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ("name", "community_type")
        verbose_name_plural = "Communities"

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug or "community"
            counter = 1
            while Community.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} [{self.get_community_type_display()}]"


class CommunityMember(models.Model):
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="members"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_memberships"
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("community", "user")
        ordering = ["joined_at"]

    def __str__(self):
        return f"{self.user.email} in {self.community.name}"
