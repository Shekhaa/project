from django.contrib import admin
from .models import StudentProfile

@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = (
        "username",
        "college",
        "course",
        "branch",
        "academic_year",
        "section",
        "verified",
        "profile_completed",
        "created_at",
    )
    list_filter = ("college", "course", "branch", "verified", "profile_completed")
    search_fields = ("username", "user__email", "admission_number")
