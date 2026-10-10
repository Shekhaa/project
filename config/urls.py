from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static

def health_check(request):
    return JsonResponse({
        "status": "ok",
        "app": "Campus Connect API",
        "version": "2.0.0",
        "message": "Campus Connect Backend services are running properly."
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health-check'),
    
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
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
