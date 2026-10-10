from rest_framework import serializers
from .models import Community, CommunityMember

class CommunitySerializer(serializers.ModelSerializer):
    total_members = serializers.IntegerField(source="members.count", read_only=True)
    is_joined = serializers.SerializerMethodField()

    class Meta:
        model = Community
        fields = [
            "id",
            "name",
            "slug",
            "community_type",
            "description",
            "image",
            "is_private",
            "total_members",
            "is_joined",
            "created_at",
        ]

    def get_is_joined(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.members.filter(user=request.user).exists()
        return False


class CreateCustomCommunitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Community
        fields = ["name", "description", "image", "is_private"]

    def validate_name(self, value):
        name = value.strip()
        if len(name) < 3:
            raise serializers.ValidationError("Community name must be at least 3 characters long.")
        return name


class CommunityMemberSerializer(serializers.ModelSerializer):
    community = CommunitySerializer(read_only=True)

    class Meta:
        model = CommunityMember
        fields = ["id", "community", "joined_at"]
