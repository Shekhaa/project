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
    admission_number = models.CharField(max_length=50, blank=True, null=True)

    # Public Profile
    username = models.CharField(max_length=50, unique=True, db_index=True)
    bio = models.TextField(blank=True, max_length=500)
    profile_picture = models.ImageField(upload_to="profile_pictures/", blank=True, null=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES)
    anonymous_enabled = models.BooleanField(default=False, help_text="Allow posting under anonymous pseudonyms")

    # College Hierarchy
    college = models.ForeignKey(College, on_delete=models.PROTECT, related_name="profiles")
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="profiles")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="profiles")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="profiles")
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="profiles", blank=True, null=True)

    verified = models.BooleanField(default=False)
    profile_completed = models.BooleanField(default=False)

    # College ID Card OCR & Fraud Prevention
    id_card_image = models.ImageField(upload_to="id_cards/", blank=True, null=True)
    id_card_verified = models.BooleanField(default=False)
    id_card_ocr_data = models.JSONField(blank=True, null=True)
    id_card_hash = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    verification_method = models.CharField(
        max_length=30,
        default="MANUAL",
        choices=[
            ("EMAIL_OTP", "Email OTP"),
            ("ID_CARD_OCR", "College ID Card OCR"),
            ("PHONE_OTP", "Phone OTP"),
            ("ADMIN_VERIFIED", "Admin Verified"),
            ("MANUAL", "Manual Entry"),
        ]
    )
    is_flagged_fake = models.BooleanField(default=False, help_text="Flagged by admin or duplicate detection")
    flag_reason = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["username"]

    def __str__(self):
        return f"@{self.username} ({self.college.short_name} - {self.course.name})"
