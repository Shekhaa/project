from .models import Notification
from chat.models import Message

def social_context(request):
    if request.user.is_authenticated:
        unread_notifications = Notification.objects.filter(recipient=request.user, is_read=False).count()
        unread_messages = Message.objects.filter(conversation__participants=request.user, is_read=False).exclude(sender=request.user).count()
        return {
            'unread_notifications_count': unread_notifications,
            'unread_messages_count': unread_messages,
        }
    return {
        'unread_notifications_count': 0,
        'unread_messages_count': 0,
    }
