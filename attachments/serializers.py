from rest_framework import serializers
from config.media_utils import resolve_media_url
from .models import MediaAttachment

class MediaAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = MediaAttachment
        fields = [
            "id",
            "file_url",
            "download_url",
            "file_name",
            "file_type",
            "file_extension",
            "mime_type",
            "file_size",
            "file_size_formatted",
            "image_width",
            "image_height",
            "caption",
            "order",
            "created_at",
        ]
        read_only_fields = fields

    def get_file_url(self, obj):
        return resolve_media_url(self.context.get("request"), obj.file) or ""

    def get_download_url(self, obj):
        return resolve_media_url(self.context.get("request"), f"/api/attachments/{obj.id}/download/")
