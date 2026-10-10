from django.contrib import admin
from .models import LostFoundPost

@admin.register(LostFoundPost)
class LostFoundPostAdmin(admin.ModelAdmin):
    list_display = ("item_type", "location", "college", "author", "status", "created_at")
    list_filter = ("item_type", "status", "college", "created_at")
    search_fields = ("description", "location", "author__email")
