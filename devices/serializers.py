from rest_framework import serializers
from .models import Device

class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = [
            "id",
            "device_uuid",
            "device_name",
            "manufacturer",
            "model",
            "os",
            "os_version",
            "browser",
            "app_version",
            "ip_address",
            "is_primary",
            "is_active",
            "last_login",
            "created_at",
        ]
        read_only_fields = ["id", "is_primary", "is_active", "last_login", "created_at"]


class RegisterDeviceInputSerializer(serializers.Serializer):
    device_uuid = serializers.CharField(required=True)
    device_name = serializers.CharField(required=True)
    manufacturer = serializers.CharField(required=False, allow_blank=True, default="")
    model = serializers.CharField(required=False, allow_blank=True, default="")
    os = serializers.CharField(required=False, allow_blank=True, default="")
    os_version = serializers.CharField(required=False, allow_blank=True, default="")
    browser = serializers.CharField(required=False, allow_blank=True, default="")
    app_version = serializers.CharField(required=False, allow_blank=True, default="")
    is_primary = serializers.BooleanField(required=False, default=False)
