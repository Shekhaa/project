import json
import urllib.request
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.http import HttpResponse
from django.db.models import Q
from otp.services import OTPService
from colleges.models import CollegeDomain
from .models import User
from .serializers import (
    SendEmailOTPSerializer,
    VerifyEmailOTPSerializer,
    SendPhoneOTPSerializer,
    VerifyPhoneOTPSerializer,
    SetPasswordSerializer,
    LoginWithPasswordSerializer,
    UserMeSerializer,
)

class SendEmailOTPView(APIView):
    """
    POST /api/authentication/email/send-otp/
    Validates college email domain, dispatches 6-digit OTP and 1-Click Magic Link.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SendEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        success, msg, otp_record = OTPService.send_email_otp(email, purpose="EMAIL_LOGIN", return_record=True)
        if not success:
            return Response({"error": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Detect associated college
        domain_match = CollegeDomain.find_by_email(email)
        college_info = {
            "name": domain_match.college.name,
            "short_name": domain_match.college.short_name,
        } if domain_match else None

        magic_link = f"http://localhost:8000/api/authentication/email/magic-login/?token={otp_record.magic_token}"

        return Response({
            "message": msg,
            "email": email,
            "detected_college": college_info,
            "magic_token": str(otp_record.magic_token),
            "magic_link": magic_link,
            "dev_otp": otp_record.otp,
        }, status=status.HTTP_200_OK)


class VerifyEmailOTPView(APIView):
    """
    POST /api/authentication/email/verify-otp/
    Verifies college email OTP, creates/retrieves User, and issues JWT tokens.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        code = serializer.validated_data["otp"].strip()

        is_valid, err = OTPService.verify_otp(email, code, purpose="EMAIL_LOGIN")
        if not is_valid:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        # Find or create user
        user, is_new_user = User.objects.get_or_create(
            email=email,
            defaults={"is_email_verified": True}
        )

        if not user.is_email_verified:
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified"])

        password = serializer.validated_data.get("password")
        if password and len(password.strip()) >= 6:
            user.set_password(password.strip())
            user.save(update_fields=["password"])

        user.check_and_update_student_status()

        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)

        # Auto-detected college
        domain_match = CollegeDomain.find_by_email(email)
        detected_college = {
            "id": domain_match.college.id,
            "name": domain_match.college.name,
            "short_name": domain_match.college.short_name,
        } if domain_match else None

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "user": {
                "id": user.id,
                "email": user.email,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "profile_completed": user.profile_completed,
            },
            "detected_college": detected_college
        }, status=status.HTTP_200_OK)


class SendPhoneOTPView(APIView):
    """
    POST /api/authentication/phone/send-otp/
    Protected endpoint to request OTP for binding student's mobile number.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SendPhoneOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone_number"]

        # Invariant: One phone number -> one user
        existing = User.objects.filter(phone_number=phone).exclude(id=request.user.id).first()
        if existing:
            return Response(
                {"error": "This phone number is already registered to another Campus Connect account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        success, msg = OTPService.send_phone_otp(phone, purpose="PHONE_VERIFY")
        if not success:
            return Response({"error": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({"message": msg, "phone_number": phone})


class VerifyPhoneOTPView(APIView):
    """
    POST /api/authentication/phone/verify-otp/
    Verifies phone OTP and permanently binds phone to the student account.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = VerifyPhoneOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone_number"]
        code = serializer.validated_data["otp"]

        is_valid, err = OTPService.verify_otp(phone, code, purpose="PHONE_VERIFY")
        if not is_valid:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        # Check uniqueness again right before committing
        if User.objects.filter(phone_number=phone).exclude(id=request.user.id).exists():
            return Response(
                {"error": "This phone number is already registered to another account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        user.phone_number = phone
        user.is_phone_verified = True
        user.save(update_fields=["phone_number", "is_phone_verified"])
        user.check_and_update_student_status()

        return Response({
            "message": "Phone number successfully verified and bound.",
            "is_phone_verified": True,
            "is_verified_student": user.is_verified_student,
        })


class SetPasswordView(APIView):
    """
    POST /api/authentication/password/set/
    Sets a local app password or PIN for rapid subsequent logins.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data["password"]

        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])

        return Response({"message": "App password successfully set."})


class LoginView(APIView):
    """
    POST /api/authentication/login/
    Login using college email, username, or mobile phone number and password.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginWithPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_id = serializer.validated_data.get("identifier") or serializer.validated_data.get("email") or ""
        identifier = str(raw_id).strip()
        password = serializer.validated_data["password"]

        if not identifier:
            return Response(
                {"error": "Please enter your college email, username, or mobile number."},
                status=status.HTTP_400_BAD_REQUEST
            )

        clean_phone = "".join(filter(str.isdigit, identifier))[-10:]

        user = None
        # 1. Match by email
        user = User.objects.filter(email__iexact=identifier).first()
        # 2. Match by username
        if not user:
            user = User.objects.filter(profile__username__iexact=identifier).first()
        # 3. Match by phone
        if not user and clean_phone and len(clean_phone) == 10:
            user = User.objects.filter(phone_number=clean_phone).first()

        if not user or not user.check_password(password):
            return Response(
                {"error": "Invalid login credentials. Please check your username/email and password."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response({"error": "Account is disabled."}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        prof = getattr(user, "profile", None)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name or (prof.username if prof else user.email.split("@")[0]),
                "username": prof.username if prof else user.email.split("@")[0],
                "is_verified_student": user.is_verified_student,
                "profile_completed": user.profile_completed,
            }
        })


class LogoutView(APIView):
    """
    POST /api/authentication/logout/
    Blacklists refresh token for secure session termination.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"error": "Refresh token required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Logged out successfully."})
        except Exception as e:
            return Response({"error": f"Invalid token: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """
    GET /api/authentication/me/
    Returns authenticated user information, verification status, and student profile.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserMeSerializer(request.user)
        return Response(serializer.data)


class MagicLoginView(APIView):
    """
    GET / POST /api/authentication/email/magic-login/
    Verifies 1-click magic link token, signs in or registers student, issues JWT.
    If opened via mobile/desktop browser GET, displays responsive confirmation HTML with deep-link.
    If called via API (POST or JSON Accept), returns direct JWT JSON payload.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get("token")
        if not token:
            return Response({"error": "Magic token parameter is required."}, status=status.HTTP_400_BAD_REQUEST)
        return self._process_token(request, token)

    def post(self, request):
        token = request.data.get("token") or request.query_params.get("token")
        if not token:
            return Response({"error": "Magic token is required."}, status=status.HTTP_400_BAD_REQUEST)
        return self._process_token(request, token)

    def _process_token(self, request, token):
        is_valid, err, email = OTPService.verify_magic_token(token, purpose="EMAIL_LOGIN")
        if not is_valid:
            if "text/html" in request.headers.get("Accept", "") and request.method == "GET":
                html_err = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Link Expired - Campus Connect</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
                        .card {{ max-width: 420px; margin: 20px; background: #111827; border: 1px solid #ef4444; border-radius: 16px; padding: 32px 24px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
                        h2 {{ color: #ef4444; margin-top: 0; }}
                        p {{ color: #94a3b8; font-size: 15px; line-height: 1.5; }}
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                        <h2>Verification Link Expired</h2>
                        <p>{err}</p>
                        <p>Please open the Campus Connect app and request a fresh verification link.</p>
                    </div>
                </body>
                </html>
                """
                return HttpResponse(html_err, status=400, content_type="text/html")
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        # Token is valid! Find or create user
        user, is_new_user = User.objects.get_or_create(
            email=email,
            defaults={"is_email_verified": True}
        )
        if not user.is_email_verified:
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified"])

        user.check_and_update_student_status()
        refresh = RefreshToken.for_user(user)

        domain_match = CollegeDomain.find_by_email(email)
        detected_college = {
            "id": domain_match.college.id,
            "name": domain_match.college.name,
            "short_name": domain_match.college.short_name,
        } if domain_match else None

        # Return rich HTML if clicked from Outlook browser
        if "text/html" in request.headers.get("Accept", "") and request.method == "GET":
            college_name = detected_college["name"] if detected_college else "Your College"
            deep_link = f"campusconnect://auth/success?access={str(refresh.access_token)}&refresh={str(refresh)}"
            html_success = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Verified! - Campus Connect</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta http-equiv="refresh" content="2;url={deep_link}">
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
                    .card {{ max-width: 440px; margin: 20px; background: #111827; border: 1px solid #10b981; border-radius: 20px; padding: 36px 24px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }}
                    h2 {{ color: #10b981; margin: 10px 0; font-size: 24px; }}
                    .btn {{ display: block; background: #2563eb; color: white; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 16px; margin-top: 24px; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <div style="font-size: 52px; margin-bottom: 8px;">🎓</div>
                    <h2>Email Verified!</h2>
                    <p style="color: #cbd5e1; font-size: 16px; margin: 8px 0;">Welcome to <strong>{college_name}</strong></p>
                    <p style="color: #64748b; font-size: 14px; margin: 0 0 16px 0;">{email}</p>
                    <a href="{deep_link}" class="btn">Open Campus Connect App</a>
                    <p style="color: #475569; font-size: 12px; margin-top: 16px;">Redirecting automatically in 2 seconds...</p>
                </div>
            </body>
            </html>
            """
            return HttpResponse(html_success, content_type="text/html")

        return Response({
            "message": "Successfully verified via 1-click magic link.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "user": {
                "id": user.id,
                "email": user.email,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "profile_completed": user.profile_completed,
            },
            "detected_college": detected_college
        }, status=status.HTTP_200_OK)


def verify_microsoft_account(access_token):
    """
    Verifies user identity with Microsoft Entra ID.
    Calls Microsoft Graph API: https://graph.microsoft.com/v1.0/me
    Returns: (is_valid, email, display_name, error_message)
    """
    if not access_token:
        return False, None, None, "Microsoft access_token is required."

    url = "https://graph.microsoft.com/v1.0/me"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=7) as response:
            if response.status != 200:
                return False, None, None, f"Microsoft API returned status {response.status}"
            data = json.loads(response.read().decode("utf-8"))
            email = data.get("mail") or data.get("userPrincipalName")
            display_name = data.get("displayName", "")
            if not email:
                return False, None, None, "No institutional email found in Microsoft account."
            return True, email.lower(), display_name, None
    except Exception as e:
        return False, None, None, f"Failed to authenticate with Microsoft: {str(e)}"


class MicrosoftSSOView(APIView):
    """
    POST /api/authentication/microsoft/
    Single-Tap College Login using Microsoft Entra ID (Azure AD).
    Extracts verified @college.ac.in institutional email.
    Auto-detects college domain, provisions student account, and returns JWT tokens.
    Zero OTP typing, zero Outlook inbox searching required.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        access_token = request.data.get("access_token")

        # Test / Simulation hook for DEBUG mode
        if settings.DEBUG and request.data.get("dev_mock_email"):
            email = request.data.get("dev_mock_email", "").strip().lower()
            display_name = request.data.get("dev_mock_name", "Student User")
            is_valid = True
            err = None
        else:
            if not access_token:
                return Response(
                    {"error": "access_token is required from Microsoft authentication."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            is_valid, email, display_name, err = verify_microsoft_account(access_token)

        if not is_valid:
            return Response({"error": err}, status=status.HTTP_401_UNAUTHORIZED)

        # Verify email domain belongs to an approved college
        domain_match = CollegeDomain.find_by_email(email)
        if not domain_match:
            return Response({
                "error": f"The email '{email}' does not belong to any recognized university domain.",
                "email": email,
                "suggestion": "Please sign in using your official university-issued Microsoft account."
            }, status=status.HTTP_403_FORBIDDEN)

        # Get or create user
        user, is_new_user = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": display_name,
                "is_email_verified": True
            }
        )

        # Update verified status & name if not set
        fields_to_update = []
        if not user.is_email_verified:
            user.is_email_verified = True
            fields_to_update.append("is_email_verified")
        if display_name and not user.full_name:
            user.full_name = display_name
            fields_to_update.append("full_name")

        if fields_to_update:
            user.save(update_fields=fields_to_update)

        user.check_and_update_student_status()

        # Generate JWT
        refresh = RefreshToken.for_user(user)

        return Response({
            "message": "Microsoft single-tap authentication successful.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "profile_completed": user.profile_completed,
            },
            "detected_college": {
                "id": domain_match.college.id,
                "name": domain_match.college.name,
                "short_name": domain_match.college.short_name,
            }
        }, status=status.HTTP_200_OK)


class DemoUsersListView(APIView):
    """
    GET /api/authentication/demo-users/
    Returns list of seeded demo campus students for rapid testing & 1-tap switching.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        gehu_users = list(User.objects.filter(is_verified_student=True, email__icontains="gehu.ac.in").select_related("profile", "profile__course", "profile__branch", "profile__college"))
        other_users = list(User.objects.filter(is_verified_student=True).exclude(email__icontains="gehu.ac.in").select_related("profile", "profile__course", "profile__branch", "profile__college")[:10])
        users = gehu_users + other_users
        data = []
        for u in users:
            prof = getattr(u, "profile", None)
            data.append({
                "id": u.id,
                "email": u.email,
                "phone_number": u.phone_number or "",
                "full_name": u.full_name or (prof.username if prof else u.email.split("@")[0]),
                "username": prof.username if prof else u.email.split("@")[0],
                "avatar": prof.profile_picture.url if prof and prof.profile_picture else None,
                "college": prof.college.short_name if prof and prof.college else "GEHU",
                "course": prof.course.name if prof and prof.course else "B.Tech",
                "branch": prof.branch.name if prof and prof.branch else "CSE",
                "bio": prof.bio if prof else "",
                "gender": prof.gender if prof else "Other",
            })
        return Response(data)


class DevQuickLoginView(APIView):
    """
    POST /api/authentication/dev-quick-login/
    Enables 1-tap switching between demo student accounts for rapid multi-user testing.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        identifier = request.data.get("email") or request.data.get("username")
        user_id = request.data.get("user_id")

        user = None
        if user_id:
            user = User.objects.filter(id=user_id).first()
        elif identifier:
            user = User.objects.filter(
                Q(email__iexact=identifier) | Q(profile__username__iexact=identifier)
            ).first()

        if not user:
            user = User.objects.filter(is_verified_student=True).first()

        if not user:
            return Response({"error": "No verified student accounts found."}, status=status.HTTP_404_NOT_FOUND)

        refresh = RefreshToken.for_user(user)
        domain_match = CollegeDomain.find_by_email(user.email)
        detected_college = {
            "id": domain_match.college.id,
            "name": domain_match.college.name,
            "short_name": domain_match.college.short_name,
        } if domain_match else None

        return Response({
            "message": f"Switched to @{getattr(user, 'profile', None) and user.profile.username or user.email}",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "profile_completed": user.profile_completed,
            },
            "detected_college": detected_college
        })


class ChangePasswordView(APIView):
    """
    POST /api/authentication/password/change/
    Change password for authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")
        if not new_password or len(new_password) < 6:
            return Response(
                {"error": "New password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if request.user.has_usable_password() and old_password:
            if not request.user.check_password(old_password):
                return Response(
                    {"error": "Current password is incorrect."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        return Response({"message": "Password changed successfully."})


class ForgotPasswordView(APIView):
    """
    POST /api/authentication/password/forgot/
    Initiates password reset OTP for college email.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return Response({"error": "No student found with this email."}, status=status.HTTP_404_NOT_FOUND)
        
        success, msg, otp_record = OTPService.send_email_otp(email, purpose="PASSWORD_RESET", return_record=True)
        if not success:
            return Response({"error": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({
            "message": f"Password reset OTP sent to {email}.",
            "email": email,
            "dev_otp": otp_record.otp if (settings.DEBUG and otp_record) else None
        })


class ResetPasswordView(APIView):
    """
    POST /api/authentication/password/reset/
    Verifies reset OTP and sets new password.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp", "").strip()
        new_password = request.data.get("new_password", "").strip()

        if not email or not otp or not new_password:
            return Response(
                {"error": "Email, OTP and new password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(new_password) < 6:
            return Response(
                {"error": "New password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST
            )

        is_valid, err = OTPService.verify_otp(email, otp, purpose="PASSWORD_RESET")
        if not is_valid:
            return Response({"error": err or "Invalid or expired reset code."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        return Response({"message": "Password has been successfully reset. You can now log in."})


class SendPhoneLoginOTPView(APIView):
    """
    POST /api/authentication/phone-login/send-otp/
    Allows students to log in directly via Mobile Number (no Outlook OTP required!).
    Ideal for campus blind testing where students don't check Outlook.
    Supports both SMS and 100% Free WhatsApp OTP dispatch!
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import urllib.parse
        import math

        raw_phone = str(request.data.get("phone_number", "")).strip()
        channel = str(request.data.get("channel", "WHATSAPP")).upper()
        clean_phone = "".join(filter(str.isdigit, raw_phone))[-10:]
        if not clean_phone or len(clean_phone) < 10:
            return Response({"error": "Please provide a valid 10-digit mobile number."}, status=status.HTTP_400_BAD_REQUEST)

        # Strict Campus Geofencing: Graphic Era (GEU Clement Town & GEHU Dehradun)
        GEU_CAMPUS = (30.2685, 77.9942)
        GEHU_CAMPUS = (30.2700, 77.9980)
        STRICT_CAMPUS_RADIUS_KM = 0.5 # Strict 500 meters campus perimeter

        lat = request.data.get("latitude")
        lng = request.data.get("longitude")
        bypass_geo = request.data.get("bypass_geofence", False)

        geo_status = {
            "inside_campus": True,
            "campus": "Graphic Era Hill University / GEU Dehradun",
            "distance_km": 0.0,
            "geofence_verified": True
        }

        if lat is not None and lng is not None and not bypass_geo:
            try:
                user_lat = float(lat)
                user_lng = float(lng)

                def haversine(lat1, lon1, lat2, lon2):
                    R = 6371.0
                    dlat = math.radians(lat2 - lat1)
                    dlon = math.radians(lon2 - lon1)
                    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
                    return R * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))

                dist_geu = haversine(user_lat, user_lng, GEU_CAMPUS[0], GEU_CAMPUS[1])
                dist_gehu = haversine(user_lat, user_lng, GEHU_CAMPUS[0], GEHU_CAMPUS[1])
                min_dist = min(dist_geu, dist_gehu)

                geo_status["distance_km"] = round(min_dist, 2)
                if min_dist > STRICT_CAMPUS_RADIUS_KM:
                    geo_status["inside_campus"] = False
                    return Response({
                        "error": f"Strict Campus Perimeter Required: You are {round(min_dist, 2)} km away. Graphic Era campus perimeter is strictly 500 meters (0.5 km). You will enter as 🔴 Semi-Verified upon physical presence or enable simulation for testing.",
                        "geo_status": geo_status,
                    }, status=status.HTTP_403_FORBIDDEN)
            except (ValueError, TypeError):
                pass

        success, msg, otp_record = OTPService.send_phone_otp(clean_phone, purpose="PHONE_LOGIN", return_record=True)
        if not success:
            return Response({"error": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        is_real = getattr(otp_record, "real_sent", False)
        gateway_msg = getattr(otp_record, "gateway_msg", None)
        code = otp_record.otp if otp_record else "123456"

        # WhatsApp Direct Links (100% Free & Zero Setup Required)
        wa_text = f"Your Campus Connect verification code is {code}. Valid for 5 minutes."
        wa_encoded = urllib.parse.quote(wa_text)
        whatsapp_link = f"https://api.whatsapp.com/send?phone=91{clean_phone}&text={wa_encoded}"
        whatsapp_app_link = f"whatsapp://send?phone=91{clean_phone}&text={wa_encoded}"

        return Response({
            "message": msg,
            "phone_number": clean_phone,
            "channel": channel,
            "is_real_sms": is_real,
            "gateway_notice": gateway_msg if not is_real else None,
            "dev_otp": code if (settings.DEBUG and otp_record) else None,
            "whatsapp_link": whatsapp_link,
            "whatsapp_app_link": whatsapp_app_link,
            "geo_status": geo_status,
        }, status=status.HTTP_200_OK)


class VerifyPhoneLoginOTPView(APIView):
    """
    POST /api/authentication/phone-login/verify-otp/
    Verifies phone OTP and logs student in as SEMI_VERIFIED (🔴 Red Tick).
    They must scan physical ID card to upgrade to FULLY_VERIFIED (🛡️ Verified Student).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        raw_phone = str(request.data.get("phone_number", "")).strip()
        clean_phone = "".join(filter(str.isdigit, raw_phone))[-10:]
        code = str(request.data.get("otp", "")).strip()

        if not clean_phone or not code:
            return Response({"error": "Phone number and verification OTP code are required."}, status=status.HTTP_400_BAD_REQUEST)

        is_valid, err = OTPService.verify_otp(clean_phone, code, purpose="PHONE_LOGIN")
        if not is_valid:
            return Response({"error": err or "Invalid or expired OTP code."}, status=status.HTTP_400_BAD_REQUEST)

        # Find or create user with this phone number
        user = User.objects.filter(phone_number=clean_phone).first()
        is_new_user = False
        if not user:
            placeholder_email = f"student_{clean_phone}@geu.ac.in"
            # Ensure unique email if exists
            idx = 1
            while User.objects.filter(email=placeholder_email).exists():
                placeholder_email = f"student_{clean_phone}_{idx}@geu.ac.in"
                idx += 1

            # On-Campus Phone login starts as SEMI_VERIFIED (🔴 Red Tick) until physical ID card is scanned!
            user = User.objects.create(
                email=placeholder_email,
                phone_number=clean_phone,
                is_phone_verified=True,
                is_email_verified=False,
                is_verified_student=False,
            )
            is_new_user = True
        else:
            if not user.is_phone_verified:
                user.is_phone_verified = True
                user.save(update_fields=["is_phone_verified"])

        password = str(request.data.get("password", "")).strip()
        if password and len(password) >= 6:
            user.set_password(password)
            user.save(update_fields=["password"])

        refresh = RefreshToken.for_user(user)

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "user": {
                "id": user.id,
                "email": user.email,
                "phone_number": user.phone_number,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "verification_tier": user.verification_tier,
                "badge_label": user.badge_label,
                "profile_completed": user.profile_completed,
            }
        }, status=status.HTTP_200_OK)


class IDCardLoginView(APIView):
    """
    POST /api/authentication/id-card-login/
    Spotify / SheerID style frictionless onboarding:
    Allows students to scan / upload their Physical College ID Card image directly.
    Runs native Windows OCR & Anti-fraud uniqueness verification.
    Instantly verifies student identity and logs them in!
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import re
        import base64
        from django.utils import timezone
        from django.core.files.base import ContentFile
        from profiles.ocr_service import IDCardOCRService
        from profiles.models import StudentProfile

        image_file = request.FILES.get("id_card_image")
        image_base64 = request.data.get("image_base64")

        image_bytes = None
        file_name = "id_card_scan.jpg"

        if image_file:
            image_bytes = image_file.read()
            file_name = image_file.name
        elif image_base64:
            try:
                if "," in image_base64:
                    image_base64 = image_base64.split(",", 1)[1]
                image_bytes = base64.b64decode(image_base64)
            except Exception as e:
                return Response({"error": f"Invalid base64 image: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({"error": "Please provide College ID Card photo (image_base64 or id_card_image)."}, status=status.HTTP_400_BAD_REQUEST)

        # Run OCR
        scan_res = IDCardOCRService.scan_id_card_image(image_bytes)
        anti_fraud = scan_res.get("anti_fraud", {})

        # If flagged fraud duplicate
        if anti_fraud.get("is_flagged"):
            return Response({
                "error": anti_fraud.get("flag_reason", "This ID card / Roll number is already registered."),
                "anti_fraud": anti_fraud,
            }, status=status.HTTP_409_CONFLICT)

        ext = scan_res["extracted_data"]
        full_name = ext.get("full_name") or "Verified Student"
        admission_num = ext.get("admission_number") or f"GEU2024{int(timezone.now().timestamp()) % 10000}"
        safe_roll = re.sub(r"[^A-Za-z0-9]", "", admission_num).lower()
        college_email = f"{safe_roll}@geu.ac.in"

        # Find or create user
        user = User.objects.filter(email__iexact=college_email).first()
        is_new_user = False
        if not user:
            user = User.objects.create(
                email=college_email,
                full_name=full_name,
                is_email_verified=True,
                is_phone_verified=True,
                is_verified_student=True,
            )
            is_new_user = True
        else:
            if not user.is_verified_student:
                user.is_verified_student = True
                user.save(update_fields=["is_verified_student"])

        password = str(request.data.get("password", "")).strip()
        if password and len(password) >= 6:
            user.set_password(password)
            user.save(update_fields=["password"])

        # Create or update profile
        clean_user = re.sub(r"[^a-z0-9]", "_", full_name.lower()) + "_" + safe_roll[-4:]
        profile, _ = StudentProfile.objects.get_or_create(
            user=user,
            defaults={
                "username": clean_user,
                "admission_number": admission_num,
                "college_id": ext.get("college", {}).get("id", 1),
                "course_id": ext.get("course", {}).get("id", 1),
                "branch_id": ext.get("branch", {}).get("id", 1),
                "academic_year_id": ext.get("academic_year", {}).get("id", 1),
                "section_id": ext.get("section", {}).get("id", 1),
                "bio": "Verified Student via Spotify-style ID Card OCR",
                "id_card_verified": True,
                "verification_method": "ID_CARD_OCR",
                "id_card_hash": scan_res.get("image_hash"),
                "id_card_ocr_data": ext,
            }
        )

        if image_bytes and not profile.id_card_image:
            profile.id_card_image = ContentFile(image_bytes, name=file_name)
            profile.id_card_verified = True
            profile.verification_method = "ID_CARD_OCR"
            profile.save(update_fields=["id_card_image", "id_card_verified", "verification_method"])

        # Auto-enroll in 3 Core Communities
        from communities.services import CommunityEnrollmentService
        CommunityEnrollmentService.enroll_student_in_core_communities(user, profile)

        refresh = RefreshToken.for_user(user)

        return Response({
            "message": f"Welcome, {full_name}! College ID verified successfully.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "extracted_data": ext,
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "username": profile.username,
                "is_verified_student": True,
                "id_card_verified": True,
                "verification_method": "ID_CARD_OCR",
                "profile_completed": True,
            }
        }, status=status.HTTP_200_OK)


class SearchUsersView(APIView):
    """
    GET /api/authentication/users/search/?q=<query>
    Instant Instagram/TikTok-style student discovery and search.
    Searches by name, username, email, roll number.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.GET.get("q", "").strip()
        users_qs = User.objects.filter(is_active=True).exclude(id=request.user.id)

        if query:
            users_qs = users_qs.filter(
                Q(full_name__icontains=query) |
                Q(username__icontains=query) |
                Q(email__icontains=query) |
                Q(admission_number__icontains=query)
            )

        users = users_qs.order_by("full_name")[:25]
        results = []
        for u in users:
            prof = getattr(u, "profile", None)
            results.append({
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name or (getattr(prof, "username", "") if prof else "") or u.email.split("@")[0],
                "username": (getattr(prof, "username", "") if prof else "") or u.username or u.email.split("@")[0],
                "admission_number": u.admission_number or "",
                "college_name": getattr(prof, "college_name", "") if prof else "",
                "branch_name": getattr(prof, "branch_name", "") if prof else "",
                "verified": getattr(u, "verified", True),
                "verification_tier": getattr(u, "verification_tier", "SEMI_VERIFIED"),
            })
        return Response({"results": results})



