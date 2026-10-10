from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from .managers import UserManager

class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=255, blank=True, default="")
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
        help_text="True when both college email and phone number are verified."
    )
    last_login_device = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
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
        - 'FULLY_VERIFIED': College ID card verified or official .ac.in email verified.
        - 'SEMI_VERIFIED': On-campus phone verified (Physical ID card pending).
        - 'UNVERIFIED': Not verified.
        """
        prof = getattr(self, "profile", None)
        if prof and prof.id_card_verified:
            return "FULLY_VERIFIED"
        if self.is_email_verified and ("@gehu.ac.in" in self.email.lower() or "@geu.ac.in" in self.email.lower()):
            return "FULLY_VERIFIED"
        if prof and prof.verification_method in ["ID_CARD_OCR", "ADMIN_VERIFIED", "EMAIL_OTP"]:
            return "FULLY_VERIFIED"
        if self.is_phone_verified:
            return "SEMI_VERIFIED"
        return "UNVERIFIED"

    @property
    def badge_label(self):
        tier = self.verification_tier
        if tier == "FULLY_VERIFIED":
            return "🛡️ Verified Student"
        elif tier == "SEMI_VERIFIED":
            return "🔴 Semi-Verified (ID Pending)"
        return "⚪ Unverified"

    def check_and_update_student_status(self):
        """
        Updates is_verified_student flag if both email and phone are verified.
        """
        if self.is_email_verified and self.is_phone_verified and not self.is_verified_student:
            self.is_verified_student = True
            self.save(update_fields=['is_verified_student'])
