from rest_framework import serializers
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
        if not obj.file:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url

    def get_download_url(self, obj):
        request = self.context.get("request")
        path = f"/api/attachments/{obj.id}/download/"
        if request:
            return request.build_absolute_uri(path)
        return path
