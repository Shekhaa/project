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

        serializer = NotificationSerializer(user_notifications, many=True)
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
