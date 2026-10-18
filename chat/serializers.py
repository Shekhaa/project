from rest_framework import serializers
from .models import Conversation, ConversationMember, Message

class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    sender_email = serializers.CharField(source="sender.email", read_only=True)
    sender_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "sender_email",
            "sender_avatar",
            "text",
            "attachment",
            "is_read",
            "created_at",
        ]
        read_only_fields = ["id", "sender", "sender_name", "sender_email", "sender_avatar", "is_read", "created_at"]

    def get_sender_avatar(self, obj):
        if hasattr(obj.sender, "profile") and obj.sender.profile.profile_picture:
            return obj.sender.profile.profile_picture.url
        return None


class ConversationSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    recipient = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id",
            "name",
            "is_group",
            "is_ephemeral",
            "duration",
            "purpose_tag",
            "expires_at",
            "is_expired",
            "recipient",
            "last_message",
            "unread_count",
            "updated_at",
            "created_at",
        ]

    def get_last_message(self, obj):
        request = self.context.get("request")
        qs = obj.messages.filter(is_unsent=False)
        if request and request.user.is_authenticated:
            qs = qs.exclude(deleted_for_users=request.user)
            membership = obj.members.filter(user=request.user).first()
            if membership and membership.cleared_at:
                qs = qs.filter(created_at__gt=membership.cleared_at)

        msg = qs.order_by("-created_at").first()
        if msg:
            return {
                "id": str(msg.id),
                "text": msg.text,
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
            return {
                "id": other_user.id,
                "email": other_user.email,
                "name": other_user.full_name or other_user.email.split("@")[0],
                "full_name": other_user.full_name or other_user.email.split("@")[0],
                "username": getattr(other_user.profile, "username", "") if hasattr(other_user, "profile") else "",
                "avatar": other_user.profile.profile_picture.url if hasattr(other_user, "profile") and other_user.profile.profile_picture else None,
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
