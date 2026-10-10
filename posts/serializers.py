import random
from rest_framework import serializers
from communities.models import CommunityMember
from .models import Post, PostImage, PostLike, Comment

ANONYMOUS_MASCOTS = [
    "Anonymous Owl", "Anonymous Fox", "Anonymous Tiger", "Anonymous Falcon",
    "Anonymous Bear", "Anonymous Wolf", "Anonymous Eagle", "Anonymous Panda"
]

class PostImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostImage
        fields = ["id", "image", "uploaded_at"]


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    replies_count = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "post",
            "parent",
            "text",
            "is_anonymous",
            "author_name",
            "author_username",
            "author_avatar",
            "replies_count",
            "is_edited",
            "created_at",
        ]
        read_only_fields = ["id", "author_name", "author_username", "author_avatar", "is_edited", "created_at"]

    def get_author_name(self, obj):
        if obj.is_anonymous:
            return obj.anonymous_alias or "Anonymous Student"
        return obj.user.full_name or obj.user.email.split("@")[0]

    def get_author_username(self, obj):
        if obj.is_anonymous:
            return None
        return getattr(obj.user.profile, "username", None) if hasattr(obj.user, "profile") else None

    def get_author_avatar(self, obj):
        if obj.is_anonymous:
            return None
        if hasattr(obj.user, "profile") and obj.user.profile.profile_picture:
            return obj.user.profile.profile_picture.url
        return None

    def get_replies_count(self, obj):
        return obj.replies.count()


class PostSerializer(serializers.ModelSerializer):
    images = PostImageSerializer(many=True, read_only=True)
    total_likes = serializers.SerializerMethodField()
    total_comments = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    author_verification_tier = serializers.SerializerMethodField()
    author_badge_label = serializers.SerializerMethodField()
    community_name = serializers.CharField(source="community.name", read_only=True)
    community_slug = serializers.CharField(source="community.slug", read_only=True)
    is_liked = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    has_liked = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            "id",
            "community",
            "community_name",
            "community_slug",
            "content",
            "media_type",
            "media_url",
            "images",
            "is_anonymous",
            "anonymous_alias",
            "author_name",
            "author_username",
            "author_avatar",
            "author_verification_tier",
            "author_badge_label",
            "total_likes",
            "likes_count",
            "total_comments",
            "comments_count",
            "is_liked",
            "has_liked",
            "is_edited",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "community_name",
            "community_slug",
            "author_name",
            "author_username",
            "author_avatar",
            "total_likes",
            "likes_count",
            "total_comments",
            "comments_count",
            "is_liked",
            "has_liked",
            "is_edited",
            "created_at",
        ]

    def validate_community(self, community):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            if not CommunityMember.objects.filter(user=request.user, community=community).exists():
                raise serializers.ValidationError("You must be an enrolled member of this community to post.")
        return community

    def get_author_name(self, obj):
        # Zero-leak sanitization
        if obj.is_anonymous:
            return obj.anonymous_alias or "Anonymous Student"
        return obj.author.full_name or obj.author.email.split("@")[0]

    def get_author_username(self, obj):
        if obj.is_anonymous:
            return None
        return getattr(obj.author.profile, "username", None) if hasattr(obj.author, "profile") else None

    def get_author_avatar(self, obj):
        if obj.is_anonymous:
            return None
        if hasattr(obj.author, "profile") and obj.author.profile.profile_picture:
            return obj.author.profile.profile_picture.url
        return None

    def get_author_verification_tier(self, obj):
        if obj.is_anonymous:
            return None
        return obj.author.verification_tier

    def get_author_badge_label(self, obj):
        if obj.is_anonymous:
            return None
        return obj.author.badge_label

    def get_total_likes(self, obj):
        return getattr(obj, "likes_count", obj.likes.count())

    def get_total_comments(self, obj):
        return getattr(obj, "comments_count", obj.comments.count())

    def get_is_liked(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.likes.filter(user=request.user).exists()

    def get_likes_count(self, obj):
        return self.get_total_likes(obj)

    def get_comments_count(self, obj):
        return self.get_total_comments(obj)

    def get_has_liked(self, obj):
        return self.get_is_liked(obj)

    def create(self, validated_data):
        is_anonymous = validated_data.get("is_anonymous", False)
        if is_anonymous:
            # Assign consistent animal pseudonym
            validated_data["anonymous_alias"] = random.choice(ANONYMOUS_MASCOTS)
        return super().create(validated_data)
