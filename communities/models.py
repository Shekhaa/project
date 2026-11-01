import uuid
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
    
    # Ownership & System Management
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_communities",
        help_text="Student creator for custom communities"
    )
    is_system_managed = models.BooleanField(
        default=False,
        help_text="True for automatic college/course hierarchy communities"
    )
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
        
        # System-managed determination
        if self.community_type in ["COLLEGE", "COURSE", "BRANCH", "YEAR", "SECTION"]:
            self.is_system_managed = True

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} [{self.get_community_type_display()}]"


class CommunityMember(models.Model):
    ROLE_CHOICES = [
        ("OWNER", "Owner"),
        ("ADMIN", "Admin"),
        ("MODERATOR", "Moderator"),
        ("MEMBER", "Member"),
    ]

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
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default="MEMBER"
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("community", "user")
        ordering = ["joined_at"]

    def __str__(self):
        return f"{self.user.email} in {self.community.name} ({self.role})"


class Discussion(models.Model):
    TYPE_CHOICES = [
        ("GENERAL", "General Discussion"),
        ("QUESTION", "Question / Doubts"),
        ("RESOURCE", "Resource Sharing"),
        ("ANNOUNCEMENT", "Announcement"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="discussions"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="discussions"
    )
    title = models.CharField(max_length=300)
    content = models.TextField()
    discussion_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default="GENERAL"
    )
    tags = models.CharField(max_length=255, blank=True, default="")
    is_pinned = models.BooleanField(default=False, db_index=True)
    is_solved = models.BooleanField(default=False, db_index=True)
    accepted_answer = models.ForeignKey(
        "DiscussionReply",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+"
    )
    views_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_pinned", "-created_at"]
        indexes = [
            models.Index(fields=["community", "-is_pinned", "-created_at"]),
            models.Index(fields=["discussion_type"]),
        ]

    def __str__(self):
        return f"[{self.discussion_type}] {self.title} ({self.community.name})"

    @property
    def upvotes_count(self):
        return self.votes.filter(vote_type=1).count()

    @property
    def replies_count(self):
        return self.replies.count()


class DiscussionReply(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    discussion = models.ForeignKey(
        Discussion,
        on_delete=models.CASCADE,
        related_name="replies"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="discussion_replies"
    )
    parent_reply = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children"
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Reply by {self.author.email} on {self.discussion.title[:25]}"

    @property
    def upvotes_count(self):
        return self.votes.filter(vote_type=1).count()

    @property
    def is_accepted(self):
        return bool(self.discussion.accepted_answer_id == self.id)


class DiscussionVote(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="discussion_votes"
    )
    discussion = models.ForeignKey(
        Discussion,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="votes"
    )
    reply = models.ForeignKey(
        DiscussionReply,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="votes"
    )
    vote_type = models.SmallIntegerField(default=1) # 1 = upvote
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "discussion"],
                condition=models.Q(discussion__isnull=False),
                name="unique_user_discussion_vote"
            ),
            models.UniqueConstraint(
                fields=["user", "reply"],
                condition=models.Q(reply__isnull=False),
                name="unique_user_reply_vote"
            ),
        ]

    def __str__(self):
        target = f"Discussion #{self.discussion_id}" if self.discussion_id else f"Reply #{self.reply_id}"
        return f"{self.user.email} -> {target}"


class CommunityReport(models.Model):
    TARGET_CHOICES = [
        ("MESSAGE", "Chat Message"),
        ("DISCUSSION", "Discussion"),
        ("REPLY", "Reply"),
        ("MEMBER", "Member"),
        ("COMMUNITY", "Community"),
    ]

    REASON_CHOICES = [
        ("SPAM", "Spam / Promotion"),
        ("HARASSMENT", "Harassment / Bullying"),
        ("ABUSIVE", "Abusive Content"),
        ("INAPPROPRIATE", "Inappropriate Images / Documents"),
        ("FAKE_INFO", "Fake Information"),
        ("IMPERSONATION", "Impersonation"),
        ("OTHER", "Other"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending Review"),
        ("RESOLVED", "Resolved"),
        ("DISMISSED", "Dismissed"),
    ]

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_reports"
    )
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="reports"
    )
    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_id = models.CharField(max_length=100)
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_reports"
    )
    action_taken = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Report on {self.target_type} ({self.reason}) in {self.community.name}"
