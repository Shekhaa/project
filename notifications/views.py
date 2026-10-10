from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import Notification

@login_required
def notification_list_view(request):
    notifications = Notification.objects.filter(recipient=request.user).select_related('sender', 'sender__profile', 'post')
    # Mark unread notifications as read when viewing this page
    unread_notifications = notifications.filter(is_read=False)
    unread_notifications.update(is_read=True)

    return render(request, 'notifications/list.html', {'notifications': notifications})


@login_required
def mark_all_read_view(request):
    Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    return redirect('notifications:list')
