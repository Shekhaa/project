from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    SendEmailOTPView,
    VerifyEmailOTPView,
    MagicLoginView,
    MicrosoftSSOView,
    LinkMicrosoftSSOView,
    RedeemInviteCodeView,
    InviteCodesView,
    SendPhoneOTPView,
    VerifyPhoneOTPView,
    SetPasswordView,
    LoginView,
    LogoutView,
    MeView,
    DemoUsersListView,
    DevQuickLoginView,
    ChangePasswordView,
    ForgotPasswordView,
    ResetPasswordView,
    SendPhoneLoginOTPView,
    VerifyPhoneLoginOTPView,
    IDCardLoginView,
    SearchUsersView,
    DeleteAccountView,
)

urlpatterns = [
    # Instant Student Discovery / Search
    path("users/search/", SearchUsersView.as_view(), name="auth-users-search"),

    # Primary Email OTP & Magic Link Authentication
    path("email/send-otp/", SendEmailOTPView.as_view(), name="auth-email-send-otp"),
    path("email/verify-otp/", VerifyEmailOTPView.as_view(), name="auth-email-verify-otp"),
    path("email/magic-login/", MagicLoginView.as_view(), name="auth-email-magic-login"),

    # Campus Invite Code Verification & Generation
    path("invite/redeem/", RedeemInviteCodeView.as_view(), name="auth-invite-redeem"),
    path("invite/codes/", InviteCodesView.as_view(), name="auth-invite-codes"),

    # Direct Mobile Phone Login (Frictionless for Campus Blind Testing)
    path("phone-login/send-otp/", SendPhoneLoginOTPView.as_view(), name="auth-phone-login-send-otp"),
    path("phone-login/verify-otp/", VerifyPhoneLoginOTPView.as_view(), name="auth-phone-login-verify-otp"),

    # Spotify-Style College ID Card Photo OCR Instant Login
    path("id-card-login/", IDCardLoginView.as_view(), name="auth-id-card-login"),

    # Microsoft Entra ID (Azure SSO) Single-Tap Authentication & In-Account Linking
    path("microsoft/", MicrosoftSSOView.as_view(), name="auth-microsoft-sso"),
    path("microsoft/link/", LinkMicrosoftSSOView.as_view(), name="auth-microsoft-link"),

    # Rapid Testing & Multi-User Switcher
    path("demo-users/", DemoUsersListView.as_view(), name="auth-demo-users"),
    path("dev-quick-login/", DevQuickLoginView.as_view(), name="auth-dev-quick-login"),

    # Phone Verification Factor
    path("phone/send-otp/", SendPhoneOTPView.as_view(), name="auth-phone-send-otp"),
    path("phone/verify-otp/", VerifyPhoneOTPView.as_view(), name="auth-phone-verify-otp"),

    # App Password / PIN & Session
    path("password/set/", SetPasswordView.as_view(), name="auth-password-set"),
    path("password/change/", ChangePasswordView.as_view(), name="auth-password-change"),
    path("password/forgot/", ForgotPasswordView.as_view(), name="auth-password-forgot"),
    path("password/reset/", ResetPasswordView.as_view(), name="auth-password-reset"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("delete-account/", DeleteAccountView.as_view(), name="auth-delete-account"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
]
