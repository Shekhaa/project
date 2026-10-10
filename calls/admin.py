from django.contrib import admin
from .models import CallSession

@admin.register(CallSession)
class CallSessionAdmin(admin.ModelAdmin):
    list_display = ("room_id", "caller", "receiver", "call_type", "status", "created_at", "ended_at")
    list_filter = ("call_type", "status", "created_at")
    search_fields = ("room_id", "caller__email", "receiver__email")
