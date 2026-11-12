import re
import secrets
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from .managers import UserManager


def is_institutional_email(email: str) -> bool:
    """
    Returns True if email belongs to a recognized university domain
    and is NOT an unverified phone-login placeholder (student_<digits>@...).
    """
    if not email or "@" not in email:
        return False
    lower_email = email.strip().lower()
    if re.match(r"^student_\d+(_\d+)?@", lower_email):
        return False
    try:
        from colleges.models import CollegeDomain
        if CollegeDomain.objects.exists():
            return CollegeDomain.find_by_email(lower_email) is not None
    except Exception:
        pass
    domain = lower_email.split("@")[-1]
    return domain.endswith((".ac.in", ".edu", ".edu.in"))


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=255, blank=True, default="", db_index=True)
    phone_number = models.CharField(
        max_length=15,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="One phone number is linked to only one student account."
    )
    is_email_verified = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    is_verified_student = models.BooleanField(
        default=False,
        help_text="True when student identity is verified via college email, SSO, admin review, or campus invite."
    )
    last_login_device = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.email

    @property
    def profile_completed(self):
        return hasattr(self, 'profile') and self.profile.profile_completed

    @property
    def verification_tier(self):
        """
        Returns one of:
        - 'FULLY_VERIFIED': Microsoft SSO (@geu/@gehu), institutional email verified, or admin-approved ID.
        - 'INVITE_VERIFIED': Verified via a Campus Invite Code issued by staff or verified peer.
        - 'SEMI_VERIFIED': Physical College ID Card submitted (pending review) or phone-only login.
        - 'UNVERIFIED': Personal email (e.g. @gmail.com) browsing read-only without campus proof.
        """
        prof = getattr(self, "profile", None)
        method = getattr(prof, "verification_method", "") if prof else ""
        if prof and method in ("MICROSOFT_SSO", "ADMIN_VERIFIED"):
            return "FULLY_VERIFIED"
        if prof and method == "INVITE_CODE":
            return "INVITE_VERIFIED"
        if prof and method == "ID_CARD_OCR":
            return "FULLY_VERIFIED" if prof.id_card_verified else "SEMI_VERIFIED"
        if prof and method == "PHONE_OTP":
            return "SEMI_VERIFIED"
        if self.is_email_verified and is_institutional_email(self.email):
            return "FULLY_VERIFIED"
        if self.is_phone_verified:
            return "SEMI_VERIFIED"
        return "UNVERIFIED"

    @property
    def can_participate(self) -> bool:
        """
        Determines whether the user can post, comment, like, confess, discuss, or message.
        Unverified @gmail.com and pending/unreviewed ID accounts stay read-only until verified.
        """
        if not self.is_active:
            return False
        prof = getattr(self, "profile", None)
        if prof and prof.is_flagged_fake:
            return False
        if self.is_staff or self.is_superuser:
            return True
        method = getattr(prof, "verification_method", "") if prof else ""
        if method in ("MICROSOFT_SSO", "ADMIN_VERIFIED", "INVITE_CODE"):
            return True
        if method == "ID_CARD_OCR":
            return bool(prof and prof.id_card_verified)
        if method == "PHONE_OTP":
            return False
        if is_institutional_email(self.email):
            return True
        return False

    @property
    def badge_label(self):
        tier = self.verification_tier
        if tier == "FULLY_VERIFIED":
            return "🛡️ Verified Student"
        elif tier == "INVITE_VERIFIED":
            return "🎓 Campus Invited"
        elif tier == "SEMI_VERIFIED":
            return "🟡 ID Under Review"
        return "⚪ Unverified"

    def check_and_update_student_status(self):
        """
        Updates is_verified_student flag when the student meets campus participation criteria.
        """
        if not self.can_participate:
            return
        prof = getattr(self, "profile", None)
        method = getattr(prof, "verification_method", "") if prof else ""
        should_verify = (
            method in ("MICROSOFT_SSO", "ADMIN_VERIFIED", "INVITE_CODE")
            or (self.is_email_verified and is_institutional_email(self.email))
        )
        if should_verify and not self.is_verified_student:
            self.is_verified_student = True
            self.save(update_fields=['is_verified_student'])


class CampusInviteCode(models.Model):
    """
    Batch / Peer Campus Invite Codes for students onboarding via personal email (Gmail)
    who don't remember their university Microsoft/Outlook password yet.
    """
    code = models.CharField(max_length=24, unique=True, db_index=True)
    college = models.ForeignKey(
        "colleges.College",
        on_delete=models.CASCADE,
        related_name="invite_codes",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="issued_invite_codes",
    )
    batch_label = models.CharField(max_length=80, blank=True, default="")
    max_uses = models.PositiveIntegerField(default=5)
    uses_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.code} ({self.college.short_name}: {self.uses_count}/{self.max_uses})"

    @property
    def is_valid(self):
        if not self.is_active:
            return False
        if self.uses_count >= self.max_uses:
            return False
        if self.expires_at and self.expires_at <= timezone.now():
            return False
        return True

    @classmethod
    def generate_unique_code(cls, prefix="GEU"):
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        clean_prefix = re.sub(r"[^A-Z0-9]", "", (prefix or "CC").upper())[:6] or "CC"
        for _ in range(20):
            suffix = "".join(secrets.choice(alphabet) for _ in range(4))
            candidate = f"{clean_prefix}-{suffix}"
            if not cls.objects.filter(code=candidate).exists():
                return candidate
        return f"{clean_prefix}-{secrets.token_hex(3).upper()}"
