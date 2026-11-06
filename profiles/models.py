from django.db import models
from django.conf import settings
from colleges.models import College, Course, Branch, AcademicYear, Section

class StudentProfile(models.Model):
    GENDER_CHOICES = [
        ("Male", "Male"),
        ("Female", "Female"),
        ("Other", "Other"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile"
    )

    # Academic & Student Identity
    college_email = models.EmailField(unique=True, null=True, blank=True)
    admission_number = models.CharField(max_length=50, blank=True, null=True, db_index=True)

    # Public Profile
    username = models.CharField(max_length=50, unique=True, db_index=True)
    bio = models.TextField(blank=True, max_length=500)
    profile_picture = models.ImageField(upload_to="profile_pictures/", blank=True, null=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES)
    show_gender = models.BooleanField(
        default=True,
        help_text="If False, gender is hidden on public student badge and public profile cards"
    )
    anonymous_enabled = models.BooleanField(default=False, help_text="Allow posting under anonymous pseudonyms")

    # College Hierarchy
    college = models.ForeignKey(College, on_delete=models.PROTECT, related_name="profiles")
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="profiles")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="profiles")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="profiles")
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="profiles", blank=True, null=True)

    verified = models.BooleanField(default=False)
    profile_completed = models.BooleanField(default=False, db_index=True)

    # College ID Card OCR & Fraud Prevention
    id_card_image = models.ImageField(upload_to="id_cards/", blank=True, null=True)
    id_card_verified = models.BooleanField(default=False)
    id_card_ocr_data = models.JSONField(blank=True, null=True)
    id_card_hash = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    verification_method = models.CharField(
        max_length=30,
        default="MANUAL",
        choices=[
            ("MICROSOFT_SSO", "Microsoft Entra SSO"),
            ("EMAIL_OTP", "Email OTP"),
            ("ID_CARD_OCR", "College ID Card OCR"),
            ("PHONE_OTP", "Phone OTP"),
            ("ADMIN_VERIFIED", "Admin Verified"),
            ("MANUAL", "Manual Entry"),
        ]
    )
    is_flagged_fake = models.BooleanField(default=False, help_text="Flagged by admin or duplicate detection")
    flag_reason = models.CharField(max_length=255, blank=True, default="")

    # Privacy & Safety Preferences
    is_private_account = models.BooleanField(
        default=False,
        db_index=True,
        help_text="When True, posts and student details are only visible to approved followers"
    )
    messaging_preference = models.CharField(
        max_length=20,
        default="EVERYONE",
        choices=[
            ("EVERYONE", "Everyone (Message Requests from non-connections)"),
            ("FOLLOWING", "People I Follow"),
            ("CONNECTIONS_ONLY", "Connections Only"),
            ("NOBODY", "Nobody"),
        ],
        help_text="Controls who can direct message or send message requests"
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["username"]
        indexes = [
            models.Index(fields=["college", "branch", "academic_year"], name="profile_academic_idx"),
            models.Index(fields=["admission_number"], name="profile_admission_idx"),
        ]

    @property
    def credibility_score(self):
        return CredibilityEndorsement.objects.filter(recipient=self.user).count()

    def __str__(self):
        return f"@{self.username} ({self.college.short_name} - {self.course.name})"


class Connection(models.Model):
    """
    LinkedIn-style mutual professional & campus connections.
    Always maintains user1_id < user2_id to guarantee uniqueness and prevent bidirectional duplicates.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending Request"),
        ("ACCEPTED", "Connected"),
        ("DECLINED", "Declined"),
        ("BLOCKED", "Blocked"),
    ]

    user1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connections_as_u1"
    )
    user2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connections_as_u2"
    )
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="initiated_connections"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user1", "user2"], name="unique_student_connection"),
        ]
        indexes = [
            models.Index(fields=["status", "user1", "user2"], name="conn_status_u1_u2_idx"),
        ]

    def save(self, *args, **kwargs):
        if self.user1_id and self.user2_id and self.user1_id > self.user2_id:
            self.user1, self.user2 = self.user2, self.user1
        super().save(*args, **kwargs)

    @classmethod
    def get_relationship(cls, u1, u2):
        if not u1 or not u2 or u1.id == u2.id:
            return None
        uid1, uid2 = min(u1.id, u2.id), max(u1.id, u2.id)
        return cls.objects.filter(user1_id=uid1, user2_id=uid2).first()

    @classmethod
    def get_status(cls, current_user, other_user):
        if not current_user or not other_user or current_user.id == other_user.id:
            return "SELF"
        rel = cls.get_relationship(current_user, other_user)
        if not rel:
            return "NOT_CONNECTED"
        if rel.status == "ACCEPTED":
            return "CONNECTED"
        if rel.status == "PENDING":
            return "REQUEST_SENT" if rel.initiated_by_id == current_user.id else "REQUEST_RECEIVED"
        if rel.status == "DECLINED":
            return "DECLINED"
        if rel.status == "BLOCKED":
            return "BLOCKED"
        return "NOT_CONNECTED"

    @classmethod
    def are_connected(cls, u1, u2):
        if not u1 or not u2 or u1.id == u2.id:
            return False
        uid1, uid2 = min(u1.id, u2.id), max(u1.id, u2.id)
        return cls.objects.filter(user1_id=uid1, user2_id=uid2, status="ACCEPTED").exists()


class Follow(models.Model):
    """
    Instagram-style one-way follower graph.
    If target profile is private: status is 'PENDING' until approved.
    If target profile is public: status is immediately 'ACCEPTED'.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending Follow Request"),
        ("ACCEPTED", "Following"),
    ]

    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="following_relations"
    )
    following = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="follower_relations"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACCEPTED",
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="unique_student_follow"),
        ]
        indexes = [
            models.Index(fields=["follower", "status"], name="follow_follower_status_idx"),
            models.Index(fields=["following", "status"], name="follow_following_status_idx"),
        ]

    @classmethod
    def is_following(cls, follower, target):
        if not follower or not target or follower.id == target.id:
            return False
        return cls.objects.filter(follower=follower, following=target, status="ACCEPTED").exists()

    @classmethod
    def get_status(cls, follower, target):
        if not follower or not target or follower.id == target.id:
            return "SELF"
        rel = cls.objects.filter(follower=follower, following=target).first()
        if not rel:
            return "NOT_FOLLOWING"
        if rel.status == "ACCEPTED":
            return "FOLLOWING"
        if rel.status == "PENDING":
            return "REQUEST_SENT"
        return "NOT_FOLLOWING"


class UserBlock(models.Model):
    """
    Universal student blocking model.
    Prevents direct messaging, connection requests, follows, and view of private activity.
    """
    blocker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_users_set"
    )
    blocked = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by_users_set"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["blocker", "blocked"], name="unique_user_block"),
        ]

    @classmethod
    def is_blocked(cls, u1, u2):
        if not u1 or not u2 or u1.id == u2.id:
            return False
        return cls.objects.filter(
            models.Q(blocker=u1, blocked=u2) | models.Q(blocker=u2, blocked=u1)
        ).exists()


class CredibilityEndorsement(models.Model):
    """
    Student-to-student lightweight credibility endorsement / upvote.
    A verified student can endorse another student (Snapchat-style simplicity).
    One user can provide only one active endorsement to another.
    """
    endorser = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="given_endorsements"
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_endorsements"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["endorser", "recipient"], name="unique_credibility_endorsement"),
        ]
        indexes = [
            models.Index(fields=["recipient", "-created_at"], name="cred_recipient_idx"),
            models.Index(fields=["endorser", "-created_at"], name="cred_endorser_idx"),
        ]

    def __str__(self):
        return f"{self.endorser.email} endorsed {self.recipient.email} ({self.created_at:%Y-%m-%d})"

