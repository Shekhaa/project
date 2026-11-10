from rest_framework import serializers
from config.media_utils import resolve_media_url
from .models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_avatar = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id',
            'notification_type',
            'title',
            'message',
            'data',
            'is_read',
            'created_at',
            'sender_name',
            'sender_avatar',
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        if not obj.sender:
            return "Campus Connect"
        return obj.sender.full_name or obj.sender.email.split('@')[0]

    def get_sender_avatar(self, obj):
        if obj.sender and hasattr(obj.sender, 'profile') and obj.sender.profile.profile_picture:
            return resolve_media_url(self.context.get("request"), obj.sender.profile.profile_picture)
        return None
