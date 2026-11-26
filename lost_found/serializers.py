from rest_framework import serializers
from config.media_utils import resolve_media_url
from .models import LostFoundPost

class LostFoundPostSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    author_email = serializers.CharField(source="author.email", read_only=True)
    author_username = serializers.SerializerMethodField()
    college_name = serializers.CharField(source="college.name", read_only=True)
    is_owner = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    reporter_name = serializers.SerializerMethodField()
    reporter_id = serializers.IntegerField(source="author.id", read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = LostFoundPost
        fields = [
            "id",
            "item_type",
            "description",
            "location",
            "image",
            "status",
            "college",
            "college_name",
            "author",
            "author_name",
            "author_email",
            "author_username",
            "reporter_name",
            "reporter_id",
            "is_owner",
            "is_mine",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = [
            "id",
            "college",
            "college_name",
            "author",
            "author_name",
            "author_email",
            "author_username",
            "reporter_name",
            "reporter_id",
            "status",
            "is_owner",
            "is_mine",
            "created_at",
            "resolved_at",
        ]

    def get_image(self, obj):
        if not obj.image:
            return None
        return resolve_media_url(self.context.get("request"), obj.image)

    def get_author_username(self, obj):
        return getattr(obj.author.profile, "username", None) if hasattr(obj.author, "profile") else None

    def get_is_mine(self, obj):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            return obj.author_id == request.user.id
        return False

    def get_is_owner(self, obj):
        return self.get_is_mine(obj)

    def get_reporter_name(self, obj):
        if getattr(obj.author, "full_name", None):
            return obj.author.full_name
        prof = getattr(obj.author, "profile", None)
        if prof and getattr(prof, "username", None):
            return prof.username
        email = getattr(obj.author, "email", "") or ""
        return email.split("@")[0] if "@" in email else "Campus Student"
