from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static

from django.shortcuts import render
from .admin_ops_views import admin_ops_overview
from .moderation_views import moderation_reports, moderation_action, moderation_stats

def landing_portal(request):
    return render(request, "landing.html")

def health_check(request):
    return JsonResponse({
        "status": "ok",
        "app": "Campus Connect API",
        "version": "2.0.0",
        "message": "Campus Connect Backend services are running properly."
    })

urlpatterns = [
    path('', landing_portal, name='home'),
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health-check'),
    path('api/admin-ops/overview/', admin_ops_overview, name='admin-ops-overview'),

    # Junto Safety & Campus Moderation APIs
    path('api/moderation/reports/', moderation_reports, name='moderation-reports'),
    path('api/moderation/reports/<int:post_id>/action/', moderation_action, name='moderation-action'),
    path('api/moderation/stats/', moderation_stats, name='moderation-stats'),
    
    # Campus Connect Modular APIs
    path('api/authentication/', include('accounts.urls')),
    path('api/otp/', include('otp.urls')),
    path('api/devices/', include('devices.urls')),
    path('api/colleges/', include('colleges.urls')),
    path('api/profile/', include('profiles.urls')),
    path('api/communities/', include('communities.urls')),
    path('api/posts/', include('posts.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/calls/', include('calls.urls')),
    path('api/lost-found/', include('lost_found.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/attachments/', include('attachments.urls')),
]

from django.urls import path, include, re_path
from django.views.static import serve

urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
]

