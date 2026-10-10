from django.urls import path
from .views import SendOTPView, VerifyOTPView, VerifyMagicOTPView

urlpatterns = [
    path("send/", SendOTPView.as_view(), name="otp-send"),
    path("verify/", VerifyOTPView.as_view(), name="otp-verify"),
    path("verify-magic/", VerifyMagicOTPView.as_view(), name="otp-verify-magic"),
]
