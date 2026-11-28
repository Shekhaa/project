from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    SendEmailOTPView,
    VerifyEmailOTPView,
    BindEmailOTPView,
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
    path("users/search", SearchUsersView.as_view()),

    # Primary Email OTP & Magic Link Authentication
    path("email/send-otp/", SendEmailOTPView.as_view(), name="auth-email-send-otp"),
    path("email/send-otp", SendEmailOTPView.as_view()),
    path("email/verify-otp/", VerifyEmailOTPView.as_view(), name="auth-email-verify-otp"),
    path("email/verify-otp", VerifyEmailOTPView.as_view()),
    path("email/bind/", BindEmailOTPView.as_view(), name="auth-email-bind"),
    path("email/bind", BindEmailOTPView.as_view()),
    path("email/magic-login/", MagicLoginView.as_view(), name="auth-email-magic-login"),
    path("email/magic-login", MagicLoginView.as_view()),

    # Campus Invite Code Verification & Generation
    path("invite/redeem/", RedeemInviteCodeView.as_view(), name="auth-invite-redeem"),
    path("invite/redeem", RedeemInviteCodeView.as_view()),
    path("invite/codes/", InviteCodesView.as_view(), name="auth-invite-codes"),
    path("invite/codes", InviteCodesView.as_view()),

    # Direct Mobile Phone Login (Frictionless for Campus Blind Testing)
    path("phone-login/send-otp/", SendPhoneLoginOTPView.as_view(), name="auth-phone-login-send-otp"),
    path("phone-login/send-otp", SendPhoneLoginOTPView.as_view()),
    path("phone-login/verify-otp/", VerifyPhoneLoginOTPView.as_view(), name="auth-phone-login-verify-otp"),
    path("phone-login/verify-otp", VerifyPhoneLoginOTPView.as_view()),

    # Spotify-Style College ID Card Photo OCR Instant Login
    path("id-card-login/", IDCardLoginView.as_view(), name="auth-id-card-login"),
    path("id-card-login", IDCardLoginView.as_view()),

    # Microsoft Entra ID (Azure SSO) Single-Tap Authentication & In-Account Linking
    path("microsoft/", MicrosoftSSOView.as_view(), name="auth-microsoft-sso"),
    path("microsoft", MicrosoftSSOView.as_view()),
    path("microsoft/link/", LinkMicrosoftSSOView.as_view(), name="auth-microsoft-link"),
    path("microsoft/link", LinkMicrosoftSSOView.as_view()),

    # Rapid Testing & Multi-User Switcher
    path("demo-users/", DemoUsersListView.as_view(), name="auth-demo-users"),
    path("demo-users", DemoUsersListView.as_view()),
    path("dev-quick-login/", DevQuickLoginView.as_view(), name="auth-dev-quick-login"),
    path("dev-quick-login", DevQuickLoginView.as_view()),

    # Phone Verification Factor
    path("phone/send-otp/", SendPhoneOTPView.as_view(), name="auth-phone-send-otp"),
    path("phone/send-otp", SendPhoneOTPView.as_view()),
    path("phone/verify-otp/", VerifyPhoneOTPView.as_view(), name="auth-phone-verify-otp"),
    path("phone/verify-otp", VerifyPhoneOTPView.as_view()),

    # App Password / PIN & Session
    path("password/set/", SetPasswordView.as_view(), name="auth-password-set"),
    path("password/set", SetPasswordView.as_view()),
    path("password/change/", ChangePasswordView.as_view(), name="auth-password-change"),
    path("password/change", ChangePasswordView.as_view()),
    path("password/forgot/", ForgotPasswordView.as_view(), name="auth-password-forgot"),
    path("password/forgot", ForgotPasswordView.as_view()),
    path("password/reset/", ResetPasswordView.as_view(), name="auth-password-reset"),
    path("password/reset", ResetPasswordView.as_view()),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("login", LoginView.as_view(), name="auth-login-no-slash"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("logout", LogoutView.as_view()),
    path("me/", MeView.as_view(), name="auth-me"),
    path("me", MeView.as_view()),
    path("delete-account/", DeleteAccountView.as_view(), name="auth-delete-account"),
    path("delete-account", DeleteAccountView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("token/refresh", TokenRefreshView.as_view()),
]
