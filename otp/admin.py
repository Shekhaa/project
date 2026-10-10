from django.contrib import admin
from .models import OTP

@admin.register(OTP)
class OTPAdmin(admin.ModelAdmin):
    list_display = ("destination", "purpose", "otp", "attempts", "is_used", "expires_at", "created_at")
    list_filter = ("purpose", "is_used", "created_at")
    search_fields = ("destination", "otp")
    readonly_fields = ("created_at",)
