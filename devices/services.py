import secrets
from datetime import timedelta
from django.utils import timezone
from .models import Device, DeviceLinkChallenge

class DeviceService:
    @staticmethod
    def register_or_update(user, data):
        device_uuid = data["device_uuid"]
        
        # Check if user already has an active primary device
        has_primary = Device.objects.filter(user=user, is_primary=True, is_active=True).exists()
        is_primary = True if not has_primary else data.get("is_primary", False)

        if is_primary:
            # Demote any other devices from primary
            Device.objects.filter(user=user, is_primary=True).update(is_primary=False)

        device, _ = Device.objects.update_or_create(
            device_uuid=device_uuid,
            defaults={
                "user": user,
                "device_name": data.get("device_name", "Mobile Device"),
                "manufacturer": data.get("manufacturer"),
                "model": data.get("model"),
                "os": data.get("os"),
                "os_version": data.get("os_version"),
                "browser": data.get("browser"),
                "app_version": data.get("app_version"),
                "ip_address": data.get("ip_address"),
                "is_primary": is_primary,
                "is_active": True,
            }
        )
        # Update user's last login device
        user.last_login_device = device.device_name
        user.save(update_fields=["last_login_device"])
        return device

    @staticmethod
    def create_qr_challenge(web_device_uuid="", browser_info=""):
        token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timedelta(seconds=90)
        challenge = DeviceLinkChallenge.objects.create(
            challenge_token=token,
            web_device_uuid=web_device_uuid,
            web_browser_info=browser_info,
            expires_at=expires_at,
            status="PENDING"
        )
        return challenge

    @staticmethod
    def authorize_qr_challenge(token, mobile_user):
        challenge = DeviceLinkChallenge.objects.filter(
            challenge_token=token,
            status="PENDING"
        ).first()

        if not challenge or challenge.is_expired:
            return False, "QR link expired or invalid."

        challenge.user = mobile_user
        challenge.status = "AUTHORIZED"
        challenge.save(update_fields=["user", "status"])
        return True, "Web session successfully authorized from your device."

    @staticmethod
    def consume_qr_challenge(token):
        challenge = DeviceLinkChallenge.objects.filter(
            challenge_token=token,
            status="AUTHORIZED"
        ).first()

        if not challenge or challenge.is_expired:
            return None, "QR link expired or not authorized yet."

        user = challenge.user
        challenge.status = "CONSUMED"
        challenge.save(update_fields=["status"])
        return user, None
