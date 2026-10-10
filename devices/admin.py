from django.contrib import admin
from .models import Device, DeviceLinkChallenge

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "device_uuid", "is_primary", "is_active", "last_login")
    list_filter = ("is_primary", "is_active", "os")
    search_fields = ("user__email", "device_uuid", "device_name")

@admin.register(DeviceLinkChallenge)
class DeviceLinkChallengeAdmin(admin.ModelAdmin):
    list_display = ("challenge_token", "user", "status", "expires_at", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("challenge_token", "user__email")
