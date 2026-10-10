from django.contrib import admin
from .models import Community, CommunityMember

@admin.register(Community)
class CommunityAdmin(admin.ModelAdmin):
    list_display = ("name", "community_type", "slug", "is_private", "created_at")
    list_filter = ("community_type", "is_private")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}

@admin.register(CommunityMember)
class CommunityMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "community", "joined_at")
    search_fields = ("user__email", "community__name")
    list_filter = ("community__community_type",)
