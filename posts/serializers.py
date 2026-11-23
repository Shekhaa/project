import random
from rest_framework import serializers
from config.media_utils import resolve_media_url
from communities.models import CommunityMember
from attachments.serializers import MediaAttachmentSerializer
from .models import Post, PostImage, PostLike, Comment, Poll, PollOption, PollVote

ANONYMOUS_MASCOTS = [
    "Anonymous Owl", "Anonymous Fox", "Anonymous Tiger", "Anonymous Falcon",
    "Anonymous Bear", "Anonymous Wolf", "Anonymous Eagle", "Anonymous Panda"
]

class PostImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = PostImage
        fields = ["id", "image", "uploaded_at"]

    def get_image(self, obj):
        if not obj.image:
            return None
        return resolve_media_url(self.context.get("request"), obj.image)


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    replies_count = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "post",
            "parent",
            "text",
            "is_anonymous",
            "author",
            "author_name",
            "author_username",
            "author_avatar",
            "replies_count",
            "replies",
            "is_edited",
            "created_at",
        ]
        read_only_fields = ["id", "author", "author_name", "author_username", "author_avatar", "replies_count", "replies", "is_edited", "created_at"]

    def get_author(self, obj):
        if obj.is_anonymous:
            return None
        return obj.user_id

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
            return resolve_media_url(self.context.get("request"), obj.user.profile.profile_picture)
        return None

    def get_replies_count(self, obj):
        return obj.replies.count()

    def get_replies(self, obj):
        if obj.parent is not None:
            return []
        replies = obj.replies.select_related("user", "user__profile").all()
        return CommentSerializer(replies, many=True, context=self.context).data



class PollOptionSerializer(serializers.ModelSerializer):
    votes_count = serializers.SerializerMethodField()
    percentage = serializers.SerializerMethodField()

    class Meta:
        model = PollOption
        fields = ["id", "text", "order", "votes_count", "percentage"]

    def get_votes_count(self, obj):
        return getattr(obj, "votes_count", obj.votes.count())

    def get_percentage(self, obj):
        total = self.context.get("total_poll_votes", 0)
        if not total:
            poll = getattr(obj, "poll", None)
            total = poll.votes.count() if poll else 0
        if total <= 0:
            return 0.0
        v_count = self.get_votes_count(obj)
        return round((v_count / total) * 100.0, 1)


class PollSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()
    total_votes = serializers.SerializerMethodField()
    has_voted = serializers.SerializerMethodField()
    user_voted_option_id = serializers.SerializerMethodField()

    class Meta:
        model = Poll
        fields = [
            "id",
            "question",
            "is_closed",
            "total_votes",
            "has_voted",
            "user_voted_option_id",
            "options",
            "created_at",
        ]

    def get_total_votes(self, obj):
        return getattr(obj, "total_votes", obj.votes.count())

    def get_has_voted(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return obj.votes.filter(user=request.user).exists()

    def get_user_voted_option_id(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return None
        vote = obj.votes.filter(user=request.user).first()
        return vote.option_id if vote else None

    def get_options(self, obj):
        total = self.get_total_votes(obj)
        opts = obj.options.all()
        ctx = dict(self.context)
        ctx["total_poll_votes"] = total
        return PollOptionSerializer(opts, many=True, context=ctx).data


class PostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    is_author = serializers.SerializerMethodField()
    images = PostImageSerializer(many=True, read_only=True)
    attachments = MediaAttachmentSerializer(many=True, read_only=True)
    poll = serializers.SerializerMethodField()
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
    author_college_name = serializers.SerializerMethodField()
    media_url = serializers.SerializerMethodField()
    document = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            "id",
            "author",
            "is_author",
            "visibility",
            "community",
            "community_name",
            "community_slug",
            "author_college_name",
            "content",
            "media_type",
            "media_url",
            "document",
            "document_name",
            "document_size",
            "images",
            "attachments",
            "poll",
            "is_anonymous",
            "anonymous_alias",
            "is_confession",
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
            "poll",
            "is_edited",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "author",
            "is_author",
            "community_name",
            "community_slug",
            "author_college_name",
            "author_name",
            "author_username",
            "author_avatar",
            "total_likes",
            "likes_count",
            "total_comments",
            "comments_count",
            "is_liked",
            "has_liked",
            "poll",
            "is_edited",
            "created_at",
        ]
        extra_kwargs = {
            "community": {"required": False, "allow_null": True},
            "visibility": {"required": False},
        }

    def validate_community(self, community):
        request = self.context.get("request")
        visibility = self.initial_data.get("visibility", "COLLEGE")
        if visibility == "COMMUNITY" and community:
            if request and request.user.is_authenticated:
                if not CommunityMember.objects.filter(user=request.user, community=community).exists():
                    raise serializers.ValidationError("You must be an enrolled member of this community to post.")
        return community

    def get_author(self, obj):
        if obj.is_anonymous:
            return None
        return obj.author_id

    def get_is_author(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.author_id == request.user.id
        return False

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
            return resolve_media_url(self.context.get("request"), obj.author.profile.profile_picture)
        return None

    def get_author_college_name(self, obj):
        prof = getattr(obj.author, "profile", None)
        col = getattr(prof, "college", None) if prof else None
        return col.name if col else None

    def get_media_url(self, obj):
        if not obj.media_url:
            return None
        return resolve_media_url(self.context.get("request"), obj.media_url)

    def get_document(self, obj):
        if not obj.document:
            return None
        return resolve_media_url(self.context.get("request"), obj.document)

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
        if hasattr(obj, "user_has_liked"):
            return bool(obj.user_has_liked)
        return obj.likes.filter(user=request.user).exists()

    def get_likes_count(self, obj):
        return self.get_total_likes(obj)

    def get_comments_count(self, obj):
        return self.get_total_comments(obj)

    def get_has_liked(self, obj):
        return self.get_is_liked(obj)

    def get_poll(self, obj):
        poll = getattr(obj, "poll", None)
        if not poll:
            return None
        return PollSerializer(poll, context=self.context).data

    def create(self, validated_data):
        is_anonymous = validated_data.get("is_anonymous", False)
        if is_anonymous:
            # Assign consistent animal pseudonym
            validated_data["anonymous_alias"] = random.choice(ANONYMOUS_MASCOTS)
        return super().create(validated_data)
