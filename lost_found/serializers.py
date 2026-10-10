from rest_framework import serializers
from .models import LostFoundPost

class LostFoundPostSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    author_email = serializers.CharField(source="author.email", read_only=True)
    author_username = serializers.SerializerMethodField()
    college_name = serializers.CharField(source="college.name", read_only=True)
    is_owner = serializers.SerializerMethodField()

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
            "is_owner",
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
            "status",
            "is_owner",
            "created_at",
            "resolved_at",
        ]

    def get_author_username(self, obj):
        return getattr(obj.author.profile, "username", None) if hasattr(obj.author, "profile") else None

    def get_is_owner(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.author == request.user
        return False
