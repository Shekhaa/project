from django.urls import path
from .views import (
    RegisterDeviceView,
    MyDevicesListView,
    RevokeDeviceView,
    CreateQRChallengeView,
    AuthorizeQRChallengeView,
    PollQRChallengeStatusView,
)

urlpatterns = [
    path("register/", RegisterDeviceView.as_view(), name="device-register"),
    path("my-devices/", MyDevicesListView.as_view(), name="device-my-list"),
    path("<str:device_uuid>/revoke/", RevokeDeviceView.as_view(), name="device-revoke"),
    
    # WhatsApp Web Style QR Linking Endpoints
    path("qr/challenge/", CreateQRChallengeView.as_view(), name="device-qr-challenge"),
    path("qr/authorize/", AuthorizeQRChallengeView.as_view(), name="device-qr-authorize"),
    path("qr/status/<str:token>/", PollQRChallengeStatusView.as_view(), name="device-qr-status"),
]
