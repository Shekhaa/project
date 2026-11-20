from rest_framework import serializers
from config.media_utils import resolve_media_url
from attachments.serializers import MediaAttachmentSerializer
from .models import Conversation, ConversationMember, Message

class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    sender_email = serializers.CharField(source="sender.email", read_only=True)
    sender_avatar = serializers.SerializerMethodField()
    attachments = MediaAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "sender_email",
            "sender_avatar",
            "is_anonymous",
            "anonymous_alias",
            "text",
            "attachment",
            "attachments",
            "is_read",
            "created_at",
        ]
        read_only_fields = ["id", "sender", "sender_name", "sender_email", "sender_avatar", "is_anonymous", "anonymous_alias", "attachments", "is_read", "created_at"]

    def to_representation(self, obj):
        data = super().to_representation(obj)
        request = self.context.get("request")
        current_user = request.user if request else None
        is_anon_msg = obj.is_anonymous or (obj.conversation.is_anonymous and obj.conversation.anonymous_sender_id == obj.sender_id)
        if is_anon_msg and current_user != obj.sender:
            alias = obj.anonymous_alias or obj.conversation.anonymous_alias or "🦉 Anonymous Classmate"
            data["sender"] = None
            data["sender_name"] = alias
            data["sender_email"] = None
            data["sender_avatar"] = None
        return data

    def get_sender_avatar(self, obj):
        if hasattr(obj.sender, "profile") and obj.sender.profile.profile_picture:
            return resolve_media_url(self.context.get("request"), obj.sender.profile.profile_picture)
        return None


class ConversationMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    avatar = serializers.SerializerMethodField()

    class Meta:
        model = ConversationMember
        fields = ["id", "user_id", "full_name", "email", "avatar", "is_admin", "joined_at"]

    def get_full_name(self, obj):
        return getattr(obj.user, "full_name", "") or obj.user.email.split("@")[0]

    def get_avatar(self, obj):
        if hasattr(obj.user, "profile") and obj.user.profile.profile_picture:
            return resolve_media_url(self.context.get("request"), obj.user.profile.profile_picture)
        return None


class ConversationSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    recipient = serializers.SerializerMethodField()
    display_title = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_request_pending = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)
    is_anonymous_sender = serializers.SerializerMethodField()
    expires_in_days = serializers.SerializerMethodField()
    members = ConversationMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id",
            "name",
            "display_title",
            "is_group",
            "is_ephemeral",
            "duration",
            "purpose_tag",
            "expires_at",
            "expires_in_days",
            "is_expired",
            "recipient",
            "last_message",
            "unread_count",
            "is_request_pending",
            "is_anonymous",
            "anonymous_alias",
            "anonymous_sender_id",
            "is_anonymous_sender",
            "invite_code",
            "members",
            "updated_at",
            "created_at",
        ]

    def get_is_anonymous_sender(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated and obj.is_anonymous:
            return obj.anonymous_sender_id == request.user.id
        return False

    def get_expires_in_days(self, obj):
        if (obj.is_ephemeral or obj.is_anonymous) and obj.expires_at:
            from django.utils import timezone
            delta = obj.expires_at - timezone.now()
            if delta.total_seconds() <= 0:
                return 0
            return max(1, delta.days)
        return None

    def get_display_title(self, obj):
        request = self.context.get("request")
        if obj.is_group:
            return obj.name or "Group Chat"
        if not request or not request.user.is_authenticated:
            return obj.name or "Direct Chat"
        other_user = obj.get_other_member(request.user)
        if obj.is_anonymous:
            if obj.anonymous_sender_id == request.user.id:
                other_name = (getattr(other_user, "full_name", "") or getattr(other_user, "email", "").split("@")[0]) if other_user else "Classmate"
                return f"{obj.anonymous_alias or '🦉 Night Owl'} (to {other_name})"
            else:
                return obj.anonymous_alias or "🦉 Anonymous Classmate"
        if other_user:
            return getattr(other_user, "full_name", "") or other_user.email.split("@")[0]
        return obj.name or "Direct Chat"

    def get_is_request_pending(self, obj):
        request = self.context.get("request")
        if obj.is_group or not request or not request.user.is_authenticated:
            return False
        return obj.message_requests.filter(sender=request.user, status="PENDING").exists()

    def get_last_message(self, obj):
        request = self.context.get("request")
        qs = obj.messages.filter(is_unsent=False)
        if request and request.user.is_authenticated:
            qs = qs.exclude(deleted_for_users=request.user)
            membership = obj.members.filter(user=request.user).first()
            if membership and membership.cleared_at:
                qs = qs.filter(created_at__gt=membership.cleared_at)

        msg = qs.prefetch_related("attachments").order_by("-created_at").first()
        if msg:
            preview_text = msg.text
            if not preview_text:
                if msg.attachments.filter(file_type="AUDIO").exists():
                    preview_text = "🎙️ Voice Note"
                elif msg.attachments.exists() or msg.attachment:
                    preview_text = "📎 Attachment"
            return {
                "id": str(msg.id),
                "text": preview_text,
                "sender_id": msg.sender_id,
                "created_at": msg.created_at,
            }
        return None

    def get_recipient(self, obj):
        request = self.context.get("request")
        if not request or obj.is_group:
            return None
        other_user = obj.get_other_member(request.user)
        if other_user:
            if obj.is_anonymous:
                if obj.anonymous_sender_id != request.user.id:
                    alias = obj.anonymous_alias or "🦉 Anonymous Classmate"
                    return {
                        "id": None,
                        "email": None,
                        "name": alias,
                        "full_name": alias,
                        "username": "anonymous",
                        "avatar": None,
                        "profile_picture": None,
                        "is_anonymous": True,
                        "anonymous_alias": alias,
                        "is_incoming_anonymous": True,
                    }
                else:
                    prof = getattr(other_user, "profile", None)
                    avatar_url = resolve_media_url(request, prof.profile_picture) if (prof and prof.profile_picture) else None
                    return {
                        "id": other_user.id,
                        "email": other_user.email,
                        "name": other_user.full_name or other_user.email.split("@")[0],
                        "full_name": other_user.full_name or other_user.email.split("@")[0],
                        "username": getattr(prof, "username", "") if prof else "",
                        "avatar": avatar_url,
                        "profile_picture": avatar_url,
                        "is_anonymous": True,
                        "is_outgoing_anonymous": True,
                        "my_alias": obj.anonymous_alias or "🦉 Night Owl",
                    }
            prof = getattr(other_user, "profile", None)
            avatar_url = resolve_media_url(request, prof.profile_picture) if (prof and prof.profile_picture) else None
            return {
                "id": other_user.id,
                "email": other_user.email,
                "name": other_user.full_name or other_user.email.split("@")[0],
                "full_name": other_user.full_name or other_user.email.split("@")[0],
                "username": getattr(prof, "username", "") if prof else "",
                "avatar": avatar_url,
                "profile_picture": avatar_url,
                "is_anonymous": False,
            }
        return None

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            qs = obj.messages.filter(is_read=False, is_unsent=False).exclude(sender=request.user).exclude(deleted_for_users=request.user)
            membership = obj.members.filter(user=request.user).first()
            if membership and membership.cleared_at:
                qs = qs.filter(created_at__gt=membership.cleared_at)
            return qs.count()
        return 0


class CreateEphemeralGroupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=True)
    duration = serializers.ChoiceField(
        choices=["10_MIN", "1_HOUR", "12_HOURS", "24_HOURS"],
        default="24_HOURS"
    )
    purpose_tag = serializers.CharField(max_length=50, required=False, allow_blank=True, default="Hangout")


class MessageRequestSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    conversation_id = serializers.UUIDField(source="conversation.id", read_only=True)

    class Meta:
        from .models import MessageRequest
        model = MessageRequest
        fields = [
            "id",
            "sender",
            "initial_message",
            "conversation_id",
            "status",
            "is_anonymous",
            "anonymous_alias",
            "created_at",
            "updated_at",
        ]

    def get_sender(self, obj):
        from profiles.models import Connection
        request = self.context.get("request")
        current_user = request.user if request else None
        s = obj.sender
        if obj.is_anonymous and current_user != s:
            alias = obj.anonymous_alias or "🦉 Anonymous Classmate"
            return {
                "id": None,
                "full_name": alias,
                "username": "anonymous",
                "email": None,
                "college_name": s.profile.college.short_name if (hasattr(s, "profile") and s.profile and s.profile.college) else "Campus",
                "branch_name": "",
                "avatar": None,
                "profile_picture": None,
                "is_verified": False,
                "is_anonymous": True,
                "anonymous_alias": alias,
                "connection_status": "ANONYMOUS",
            }
        prof = getattr(s, "profile", None)
        conn_status = Connection.get_status(current_user, s) if current_user else "NOT_CONNECTED"
        avatar_url = resolve_media_url(request, prof.profile_picture) if (prof and prof.profile_picture) else None
        return {
            "id": s.id,
            "full_name": s.full_name or (prof.username if prof else s.email.split("@")[0]),
            "username": prof.username if prof else "",
            "email": s.email,
            "college_name": prof.college.name if (prof and prof.college) else "",
            "branch_name": prof.branch.name if (prof and prof.branch) else "",
            "avatar": avatar_url,
            "profile_picture": avatar_url,
            "is_verified": getattr(s, "is_verified_student", False),
            "connection_status": conn_status,
        }

