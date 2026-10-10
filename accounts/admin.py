from django.contrib import admin
from .models import User

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        "email",
        "full_name",
        "phone_number",
        "is_email_verified",
        "is_phone_verified",
        "is_verified_student",
        "is_active",
        "created_at",
    )
    search_fields = ("email", "full_name", "phone_number")
    list_filter = (
        "is_verified_student",
        "is_email_verified",
        "is_phone_verified",
        "is_active",
        "is_staff",
    )
    ordering = ("-created_at",)
