from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from .models import Notification
from .serializers import NotificationSerializer

def create_notification(recipient, sender, notification_type, title, message, data=None):
    """
    Helper function to dispatch in-app notifications.
    Prevents self-notification (e.g. user liking their own post).
    """
    if not recipient:
        return None
    if sender and recipient.id == sender.id:
        return None
    return Notification.objects.create(
        recipient=recipient,
        sender=sender,
        notification_type=notification_type,
        title=title,
        message=message,
        data=data or {}
    )


def resolve_mentioned_users(text, actor_user=None, exclude_ids=None, limit=10):
    """
    Resolves @mentions in text to active, non-blocked Users.
    Prioritizes exact profile__username__iexact matches before falling back
    to email prefix or full_name substring matches.
    """
    import re
    from django.contrib.auth import get_user_model
    from django.db.models import Q
    from profiles.models import UserBlock

    if not text:
        return []

    tags = re.findall(r"@([a-zA-Z0-9_\.]+)", str(text))
    if not tags:
        return []

    UserModel = get_user_model()
    seen_ids = set(exclude_ids or [])
    if actor_user and getattr(actor_user, "id", None):
        seen_ids.add(actor_user.id)

    resolved = []
    for tag in dict.fromkeys(tags):
        if len(resolved) >= limit:
            break
        exact_qs = UserModel.objects.filter(is_active=True, profile__username__iexact=tag).exclude(id__in=seen_ids)
        candidates = list(exact_qs[:3])
        if not candidates:
            fallback_qs = (
                UserModel.objects.filter(is_active=True)
                .filter(Q(email__istartswith=tag) | Q(full_name__icontains=tag))
                .exclude(id__in=seen_ids)
            )
            candidates = list(fallback_qs[:3])

        for candidate in candidates:
            if candidate.id in seen_ids:
                continue
            if actor_user and UserBlock.is_blocked(actor_user, candidate):
                continue
            seen_ids.add(candidate.id)
            resolved.append(candidate)
            if len(resolved) >= limit:
                break

    return resolved


class NotificationListView(APIView):
    """
    GET /api/notifications/
    Returns list of notifications for the authenticated user and count of unread items.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_notifications = Notification.objects.filter(
            recipient=request.user
        ).select_related('sender', 'sender__profile')[:50]

        unread_count = Notification.objects.filter(
            recipient=request.user,
            is_read=False
        ).count()

        serializer = NotificationSerializer(user_notifications, many=True, context={"request": request})
        return Response({
            "unread_count": unread_count,
            "results": serializer.data
        })


class MarkNotificationReadView(APIView):
    """
    POST /api/notifications/<id>/read/
    Marks a single notification as read.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(Notification, id=pk, recipient=request.user)
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response({"status": "success", "id": notification.id, "is_read": True})


class MarkAllNotificationsReadView(APIView):
    """
    POST /api/notifications/read-all/
    Marks all notifications for current user as read.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"status": "success", "message": "All notifications marked as read."})
