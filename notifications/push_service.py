import logging
import requests
from typing import List, Dict, Any, Optional
from django.conf import settings
from devices.models import Device

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class PushNotificationService:
    """
    Dispatches native lockscreen push notifications via Expo Push Notification service.
    Works seamlessly with Expo apps without requiring manual APNs or FCM credential setup in dev.
    """

    @classmethod
    def send_push(cls, push_tokens: List[str], title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
        if not push_tokens:
            return False

        # Filter out empty or non-Expo tokens
        valid_tokens = [t.strip() for t in push_tokens if t and t.startswith("ExponentPushToken[")]
        if not valid_tokens:
            return False

        messages = []
        for token in valid_tokens:
            messages.append({
                "to": token,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "channelId": "campus_connect_alerts",
                "priority": "high",
            })

        try:
            response = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                timeout=4.0  # Strict timeout so push delivery never blocks user request
            )
            if response.status_code == 200:
                res_data = response.json().get("data", [])
                for idx, ticket in enumerate(res_data):
                    status = ticket.get("status")
                    if status == "error":
                        err_code = (ticket.get("details") or {}).get("error")
                        if err_code == "DeviceNotRegistered" and idx < len(valid_tokens):
                            bad_token = valid_tokens[idx]
                            Device.objects.filter(push_token=bad_token).update(push_token=None)
                            logger.info(f"[Push] Inactivated unregistered push token: {bad_token}")
                return True
            else:
                logger.warning(f"[Push] Expo push returned status {response.status_code}: {response.text}")
                return False
        except Exception as e:
            logger.warning(f"[Push] Error dispatching push notification: {e}")
            return False

    @classmethod
    def notify_user(cls, user, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Sends push notification to all active devices of a given User that have a push_token.
        """
        if not user:
            return False

        active_tokens = list(
            Device.objects.filter(
                user=user,
                is_active=True,
                push_token__isnull=False
            ).exclude(push_token="").values_list("push_token", flat=True)
        )

        if not active_tokens:
            return False

        return cls.send_push(active_tokens, title, body, data)
