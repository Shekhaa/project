from rest_framework import serializers
from .models import Community, CommunityMember, Discussion, DiscussionReply, DiscussionVote, CommunityReport
from attachments.serializers import MediaAttachmentSerializer

class CommunityMemberUserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(read_only=True)
    avatar = serializers.SerializerMethodField()
    course_branch = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return getattr(obj, "full_name", "") or obj.email.split("@")[0]

    def get_avatar(self, obj):
        if hasattr(obj, "profile") and obj.profile.profile_picture:
            return obj.profile.profile_picture.url
        return None

    def get_course_branch(self, obj):
        if not hasattr(obj, "profile"):
            return ""
        parts = []
        if getattr(obj.profile, "course", None):
            parts.append(obj.profile.course.name)
        if getattr(obj.profile, "branch", None):
            parts.append(obj.profile.branch.name)
        return " • ".join(parts)


class CommunityMemberListSerializer(serializers.ModelSerializer):
    user = CommunityMemberUserSerializer(read_only=True)

    class Meta:
        model = CommunityMember
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = ["id", "joined_at"]


class DiscussionMentionedUserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)


class DiscussionReplySerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    upvotes_count = serializers.IntegerField(read_only=True)
    user_has_voted = serializers.SerializerMethodField()
    is_accepted = serializers.BooleanField(read_only=True)
    children = serializers.SerializerMethodField()
    attachments = MediaAttachmentSerializer(many=True, read_only=True)
    mentioned_users = DiscussionMentionedUserSerializer(many=True, read_only=True)

    class Meta:
        model = DiscussionReply
        fields = [
            "id",
            "discussion",
            "author",
            "author_name",
            "author_avatar",
            "parent_reply",
            "content",
            "attachments",
            "upvotes_count",
            "user_has_voted",
            "is_accepted",
            "children",
            "mentioned_users",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author", "attachments", "upvotes_count", "user_has_voted", "is_accepted", "created_at", "updated_at"]

    def get_author_name(self, obj):
        return getattr(obj.author, "full_name", "") or obj.author.email.split("@")[0]

    def get_author_avatar(self, obj):
        if hasattr(obj.author, "profile") and obj.author.profile.profile_picture:
            return obj.author.profile.profile_picture.url
        return None

    def get_user_has_voted(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user.is_authenticated:
            return obj.votes.filter(user=request.user, vote_type=1).exists()
        return False

    def get_children(self, obj):
        # Support multi-level nested discussion replies
        children = obj.children.select_related("author", "author__profile").prefetch_related("attachments").all()
        if children.exists():
            return DiscussionReplySerializer(children, many=True, context=self.context).data
        return []


class DiscussionSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_avatar = serializers.SerializerMethodField()
    community_name = serializers.CharField(source="community.name", read_only=True)
    community_slug = serializers.CharField(source="community.slug", read_only=True)
    upvotes_count = serializers.IntegerField(read_only=True)
    replies_count = serializers.IntegerField(read_only=True)
    user_has_voted = serializers.SerializerMethodField()
    attachments = MediaAttachmentSerializer(many=True, read_only=True)
    accepted_answer_snippet = serializers.SerializerMethodField()
    mentioned_users = DiscussionMentionedUserSerializer(many=True, read_only=True)

    class Meta:
        model = Discussion
        fields = [
            "id",
            "community",
            "community_name",
            "community_slug",
            "author",
            "author_name",
            "author_avatar",
            "title",
            "content",
            "discussion_type",
            "tags",
            "is_pinned",
            "is_solved",
            "accepted_answer",
            "accepted_answer_snippet",
            "views_count",
            "upvotes_count",
            "replies_count",
            "user_has_voted",
            "attachments",
            "mentioned_users",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "author",
            "community_name",
            "community_slug",
            "views_count",
            "upvotes_count",
            "replies_count",
            "user_has_voted",
            "attachments",
            "mentioned_users",
            "created_at",
            "updated_at",
        ]

    def get_author_name(self, obj):
        return getattr(obj.author, "full_name", "") or obj.author.email.split("@")[0]

    def get_author_avatar(self, obj):
        if hasattr(obj.author, "profile") and obj.author.profile.profile_picture:
            return obj.author.profile.profile_picture.url
        return None

    def get_user_has_voted(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, "user") and request.user.is_authenticated:
            return obj.votes.filter(user=request.user, vote_type=1).exists()
        return False

    def get_accepted_answer_snippet(self, obj):
        if obj.accepted_answer:
            ans = obj.accepted_answer
            snippet = (ans.content or "").strip()[:140]
            if not snippet:
                has_audio = ans.attachments.filter(file_type="AUDIO").exists()
                snippet = "🎙️ Voice Note Answer" if has_audio else "📎 Attached Answer"
            return {
                "id": str(ans.id),
                "author_name": getattr(ans.author, "full_name", "") or ans.author.email.split("@")[0],
                "content": snippet,
            }
        return None


class DiscussionDetailSerializer(DiscussionSerializer):
    replies = serializers.SerializerMethodField()

    class Meta(DiscussionSerializer.Meta):
        fields = DiscussionSerializer.Meta.fields + ["replies"]

    def get_replies(self, obj):
        top_replies = obj.replies.filter(parent_reply__isnull=True).select_related("author", "author__profile").prefetch_related("attachments")
        return DiscussionReplySerializer(top_replies, many=True, context=self.context).data


class DiscussionCreateSerializer(serializers.ModelSerializer):
    content = serializers.CharField(required=False, allow_blank=True, default="")
    attachment_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )

    class Meta:
        model = Discussion
        fields = ["title", "content", "discussion_type", "tags", "attachment_ids"]

    def validate_title(self, value):
        val = value.strip()
        if len(val) < 2:
            raise serializers.ValidationError("Title must be at least 2 characters long.")
        return val

    def validate(self, attrs):
        content = (attrs.get("content") or "").strip()
        attachment_ids = attrs.get("attachment_ids") or []
        if not content and not attachment_ids:
            raise serializers.ValidationError("Please enter details or attach a voice note / file.")
        attrs["content"] = content
        return attrs


class CommunitySerializer(serializers.ModelSerializer):
    total_members = serializers.IntegerField(source="members.count", read_only=True)
    is_joined = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    latest_discussion = serializers.SerializerMethodField()
    latest_chat_preview = serializers.SerializerMethodField()

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
            "is_system_managed",
            "total_members",
            "is_joined",
            "user_role",
            "latest_discussion",
            "latest_chat_preview",
            "invite_code",
            "created_at",
        ]

    def get_is_joined(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.members.filter(user=request.user).exists()
        return False

    def get_user_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            membership = obj.members.filter(user=request.user).first()
            return membership.role if membership else None
        return None

    def get_latest_discussion(self, obj):
        disc = obj.discussions.order_by("-created_at").first()
        if disc:
            return {
                "id": str(disc.id),
                "title": disc.title,
                "type": disc.discussion_type,
                "author_name": getattr(disc.author, "full_name", "") or disc.author.email.split("@")[0],
                "time_ago": disc.created_at.isoformat(),
            }
        return None

    def get_latest_chat_preview(self, obj):
        from chat.models import Conversation
        conv = Conversation.objects.filter(name=obj.name, is_group=True).first()
        if conv:
            msg = conv.messages.prefetch_related("attachments").order_by("-created_at").first()
            if msg:
                preview_text = msg.text[:60] if msg.text else (
                    "🎙️ Voice Note" if msg.attachments.filter(file_type="AUDIO").exists() else "[Attachment]"
                )
                return {
                    "sender_name": getattr(msg.sender, "full_name", "") or msg.sender.email.split("@")[0],
                    "text": preview_text,
                    "time": msg.created_at.isoformat(),
                }
        return None


class CommunityMemberSerializer(serializers.ModelSerializer):
    community = CommunitySerializer(read_only=True)

    class Meta:
        model = CommunityMember
        fields = ["id", "community", "role", "joined_at"]
        read_only_fields = ["id", "joined_at"]


class CreateCustomCommunitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Community
        fields = ["name", "description", "image", "is_private"]

    def validate_name(self, value):
        name = value.strip()
        if len(name) < 3:
            raise serializers.ValidationError("Community name must be at least 3 characters long.")
        return name


class CommunityReportSerializer(serializers.ModelSerializer):
    reporter_name = serializers.SerializerMethodField()
    community_name = serializers.CharField(source="community.name", read_only=True)

    class Meta:
        model = CommunityReport
        fields = [
            "id",
            "reporter",
            "reporter_name",
            "community",
            "community_name",
            "target_type",
            "target_id",
            "reason",
            "description",
            "status",
            "action_taken",
            "created_at",
        ]
        read_only_fields = ["id", "reporter", "reporter_name", "community", "community_name", "created_at"]

    def get_reporter_name(self, obj):
        return getattr(obj.reporter, "full_name", "") or obj.reporter.email.split("@")[0]
