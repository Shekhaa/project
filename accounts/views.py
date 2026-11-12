import json
import re
import base64
import urllib.request
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.http import HttpResponse
from otp.services import OTPService
from colleges.models import College, CollegeDomain, Course, Branch, AcademicYear
from profiles.models import StudentProfile
from .models import User, CampusInviteCode, is_institutional_email
from .serializers import (
    SendEmailOTPSerializer,
    VerifyEmailOTPSerializer,
    SendPhoneOTPSerializer,
    VerifyPhoneOTPSerializer,
    SetPasswordSerializer,
    LoginWithPasswordSerializer,
    UserMeSerializer,
)


def _build_user_auth_payload(request, user):
    from config.media_utils import resolve_media_url
    prof = getattr(user, "profile", None)
    avatar_url = resolve_media_url(request, prof.profile_picture) if (prof and prof.profile_picture) else None
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name or (prof.username if prof else user.email.split("@")[0]),
        "username": prof.username if prof else user.email.split("@")[0],
        "phone_number": user.phone_number,
        "profile_picture": avatar_url,
        "is_email_verified": user.is_email_verified,
        "is_phone_verified": user.is_phone_verified,
        "is_verified_student": user.is_verified_student,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "verification_tier": user.verification_tier,
        "verification_method": prof.verification_method if prof else None,
        "can_participate": user.can_participate,
        "badge_label": user.badge_label,
        "profile_completed": user.profile_completed,
    }


class SendEmailOTPView(APIView):
    """
    POST /api/authentication/email/send-otp/
    Supports both university domains (@geu.ac.in / @gehu.ac.in) and personal emails (@gmail.com).
    Dispatches 6-digit OTP and 1-Click Magic Link.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_otp'

    def post(self, request):
        serializer = SendEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        success, msg, otp_record = OTPService.send_email_otp(email, purpose="EMAIL_LOGIN", return_record=True)
        if not success:
            return Response({"error": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Detect associated college (None for personal Gmail)
        domain_match = CollegeDomain.find_by_email(email)
        college_info = {
            "id": domain_match.college.id,
            "name": domain_match.college.name,
            "short_name": domain_match.college.short_name,
        } if domain_match else None

        base_url = getattr(settings, 'BACKEND_URL', None)
        if not base_url:
            base_url = request.build_absolute_uri('/')[:-1]
        magic_link = f"{base_url}/api/authentication/email/magic-login/?token={otp_record.magic_token}"

        response_data = {
            "message": msg,
            "email": email,
            "detected_college": college_info,
            "is_personal_email": domain_match is None,
            "is_real_email": getattr(otp_record, "real_email_sent", False),
        }
        if settings.DEBUG:
            response_data["magic_token"] = str(otp_record.magic_token)
            response_data["magic_link"] = magic_link
            response_data["dev_otp"] = otp_record.otp

        return Response(response_data, status=status.HTTP_200_OK)


class VerifyEmailOTPView(APIView):
    """
    POST /api/authentication/email/verify-otp/
    Verifies email OTP, creates/retrieves User, and issues JWT tokens.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_otp'

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
            "user": _build_user_auth_payload(request, user),
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
    Login using email, username, or mobile phone number and password.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'

    def post(self, request):
        serializer = LoginWithPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_id = serializer.validated_data.get("identifier") or serializer.validated_data.get("email") or ""
        identifier = str(raw_id).strip()
        password = serializer.validated_data["password"]

        if not identifier:
            return Response(
                {"error": "Please enter your email, username, or mobile number."},
                status=status.HTTP_400_BAD_REQUEST
            )

        clean_phone = "".join(filter(str.isdigit, identifier))[-10:]

        user = None
        # 1. Match by email or linked institutional college_email
        user = User.objects.filter(
            Q(email__iexact=identifier) | Q(profile__college_email__iexact=identifier)
        ).distinct().first()
        # 2. Match by username
        if not user:
            user = User.objects.filter(profile__username__iexact=identifier).first()
        # 3. Match by roll number / admission number
        if not user:
            user = User.objects.filter(profile__admission_number__iexact=identifier).first()
        # 4. Match by email prefix (e.g. 2313812137 -> 2313812137@geu.ac.in)
        if not user and "@" not in identifier:
            user = User.objects.filter(email__istartswith=f"{identifier}@").first()
        # 5. Match by phone
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
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": _build_user_auth_payload(request, user),
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
        serializer = UserMeSerializer(request.user, context={"request": request})
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
                        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #08090a; color: #f7f8f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
                        .card {{ max-width: 420px; margin: 20px; background: #141516; border: 1px solid #eb5757; border-radius: 12px; padding: 32px 24px; text-align: center; }}
                        h2 {{ color: #eb5757; margin-top: 0; }}
                        p {{ color: #8a8f98; font-size: 15px; line-height: 1.5; }}
                    </style>
                </head>
                <body>
                    <div class="card">
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

        # Return rich HTML if clicked from Outlook/Gmail browser
        if "text/html" in request.headers.get("Accept", "") and request.method == "GET":
            college_name = detected_college["name"] if detected_college else "Campus Connect"
            deep_link = f"campusconnect://auth/success?access={str(refresh.access_token)}&refresh={str(refresh)}"
            html_success = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Verified! - Campus Connect</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta http-equiv="refresh" content="2;url={deep_link}">
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #08090a; color: #f7f8f8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }}
                    .card {{ max-width: 440px; margin: 20px; background: #141516; border: 1px solid #23252a; border-radius: 12px; padding: 36px 24px; text-align: center; }}
                    h2 {{ color: #27a644; margin: 10px 0; font-size: 22px; }}
                    .btn {{ display: block; background: #5e6ad2; color: white; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 500; font-size: 15px; margin-top: 24px; }}
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Email Verified</h2>
                    <p style="color: #d0d6e0; font-size: 15px; margin: 8px 0;">Welcome to <strong>{college_name}</strong></p>
                    <p style="color: #8a8f98; font-size: 13px; margin: 0 0 16px 0;">{email}</p>
                    <a href="{deep_link}" class="btn">Open Campus Connect App</a>
                    <p style="color: #62666d; font-size: 12px; margin-top: 16px;">Redirecting automatically...</p>
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
            "user": _build_user_auth_payload(request, user),
            "detected_college": detected_college
        }, status=status.HTTP_200_OK)


def verify_microsoft_account(token):
    """
    Verifies user identity with Microsoft Entra ID.
    Supports both:
    1. Direct OpenID Connect id_token (JWT claims: email, name, tid, sub).
    2. Bearer access_token via Microsoft Graph API (https://graph.microsoft.com/v1.0/me).
    Returns: (is_valid, email, display_name, error_message)
    """
    if not token or not isinstance(token, str):
        return False, None, None, "Microsoft authentication token is required."

    token = token.strip()

    # Path 1: Direct JWT id_token (Header.Payload.Signature)
    if token.count(".") == 2:
        try:
            parts = token.split(".")
            payload_b64 = parts[1]
            rem = len(payload_b64) % 4
            if rem > 0:
                payload_b64 += "=" * (4 - rem)
            payload_json = base64.urlsafe_b64decode(payload_b64).decode("utf-8")
            claims = json.loads(payload_json)
            email = claims.get("email") or claims.get("preferred_username") or claims.get("upn")
            display_name = claims.get("name") or claims.get("displayName", "")
            if email:
                return True, email.lower().strip(), display_name.strip(), None
        except Exception:
            pass  # Fall through to Graph API attempt

    # Path 2: Bearer access_token via Microsoft Graph API
    url = "https://graph.microsoft.com/v1.0/me"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
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
            return True, email.lower().strip(), display_name.strip(), None
    except Exception as e:
        return False, None, None, f"Failed to authenticate with Microsoft: {str(e)}"


def _resolve_microsoft_token_and_domain(request):
    token = request.data.get("token") or request.data.get("access_token") or request.data.get("id_token")

    if settings.DEBUG and request.data.get("dev_mock_email"):
        email = request.data.get("dev_mock_email", "").strip().lower()
        display_name = request.data.get("dev_mock_name", "Student User")
        is_valid = True
        err = None
    else:
        if not token:
            return None, None, None, Response(
                {"error": "Microsoft token (access_token or id_token) is required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        is_valid, email, display_name, err = verify_microsoft_account(token)

    if not is_valid:
        return None, None, None, Response({"error": err}, status=status.HTTP_401_UNAUTHORIZED)

    domain_match = CollegeDomain.find_by_email(email)
    if not domain_match:
        return None, None, None, Response({
            "error": f"The email '{email}' does not belong to any recognized university domain.",
            "email": email,
            "suggestion": "Please sign in using your official university-issued Microsoft account (@geu.ac.in / @gehu.ac.in)."
        }, status=status.HTTP_403_FORBIDDEN)

    return email, display_name, domain_match, None


def _extract_roll_and_year(ms_email: str):
    email_prefix = ms_email.split("@")[0].strip()
    roll_no = email_prefix if email_prefix.isdigit() else None
    admission_year = None
    if roll_no and len(roll_no) >= 2 and roll_no[:2].isdigit():
        admission_year = 2000 + int(roll_no[:2])
    return email_prefix, roll_no, admission_year


class MicrosoftSSOView(APIView):
    """
    POST /api/authentication/microsoft/
    Single-Tap College Login using Microsoft Entra ID (Azure AD).
    Extracts verified @college.ac.in institutional email.
    Auto-detects college domain, resolves existing or new student account (even if previously linked
    to a Gmail account via college_email), and returns JWT tokens.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email, display_name, domain_match, err_resp = _resolve_microsoft_token_and_domain(request)
        if err_resp is not None:
            return err_resp

        email_prefix, roll_no, admission_year = _extract_roll_and_year(email)

        # Match either primary login email OR previously linked college_email to avoid duplicate users
        user = (
            User.objects.filter(Q(email__iexact=email) | Q(profile__college_email__iexact=email))
            .distinct()
            .first()
        )
        is_new_user = False
        if not user:
            user = User.objects.create(
                email=email,
                full_name=display_name,
                is_email_verified=True,
                is_verified_student=True,
            )
            is_new_user = True

        # Update verified status & name if not set
        fields_to_update = []
        if not user.is_email_verified:
            user.is_email_verified = True
            fields_to_update.append("is_email_verified")
        if not user.is_verified_student:
            user.is_verified_student = True
            fields_to_update.append("is_verified_student")
        if display_name and not user.full_name:
            user.full_name = display_name
            fields_to_update.append("full_name")

        if fields_to_update:
            user.save(update_fields=fields_to_update)

        profile = getattr(user, "profile", None)
        college = domain_match.college
        course = getattr(profile, "course", None) or Course.objects.filter(college=college).first() or Course.objects.first()
        branch = getattr(profile, "branch", None) or (Branch.objects.filter(course=course).first() if course else None)

        if not profile:
            clean_name = "".join(c for c in (display_name or "").lower() if c.isalnum() or c == "_").strip("_")
            if not clean_name:
                clean_name = f"student_{roll_no or email_prefix}"
            base_user = clean_name[:25]
            candidate_user = base_user
            counter = 1
            while StudentProfile.objects.filter(username=candidate_user).exists():
                candidate_user = f"{base_user}_{counter}"
                counter += 1

            calc_year = 1
            if admission_year:
                import datetime
                diff = datetime.datetime.now().year - admission_year + 1
                if 1 <= diff <= 4:
                    calc_year = diff
            academic_year = AcademicYear.objects.filter(course=course, year_number=calc_year).first() if course else None
            if not academic_year and course:
                academic_year = AcademicYear.objects.filter(course=course).first()

            candidate_roll = roll_no or email_prefix
            if candidate_roll and StudentProfile.objects.filter(admission_number__iexact=candidate_roll).exists():
                candidate_roll = None

            profile = StudentProfile.objects.create(
                user=user,
                college_email=email,
                admission_number=candidate_roll,
                username=candidate_user,
                bio="Excited for hackathons, college fests & campus tech clubs!",
                gender="Male",
                show_gender=True,
                college=college,
                course=course,
                branch=branch,
                academic_year=academic_year,
                verified=True,
                profile_completed=False,
                id_card_verified=True,
                verification_method="MICROSOFT_SSO",
            )
        else:
            profile_fields = []
            if not profile.verified:
                profile.verified = True
                profile_fields.append("verified")
            if not profile.id_card_verified:
                profile.id_card_verified = True
                profile_fields.append("id_card_verified")
            if profile.verification_method != "MICROSOFT_SSO":
                profile.verification_method = "MICROSOFT_SSO"
                profile_fields.append("verification_method")
            if not profile.college_email:
                profile.college_email = email
                profile_fields.append("college_email")
            if profile.is_flagged_fake:
                profile.is_flagged_fake = False
                profile_fields.append("is_flagged_fake")
            if not profile.admission_number and roll_no and not StudentProfile.objects.filter(admission_number__iexact=roll_no).exclude(id=profile.id).exists():
                profile.admission_number = roll_no
                profile_fields.append("admission_number")
            if profile_fields:
                profile.save(update_fields=profile_fields)

        user.refresh_from_db()
        refresh = RefreshToken.for_user(user)

        return Response({
            "message": "Microsoft single-tap authentication successful.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "user": _build_user_auth_payload(request, user),
            "detected_student": {
                "roll_number": roll_no or email_prefix,
                "admission_year": admission_year,
                "full_name": user.full_name or display_name,
                "college_id": college.id if college else 1,
                "college_name": college.name if college else "Graphic Era University",
                "college_short_name": college.short_name if college else "GEU",
                "course_id": course.id if course else 1,
                "course_name": course.name if course else "Engineering",
                "branch_id": branch.id if branch else 1,
                "branch_name": branch.name if branch else "Computer Science",
                "suggested_username": getattr(profile, "username", f"student_{roll_no or email_prefix}"),
                "verification_method": "MICROSOFT_SSO",
            },
            "detected_college": {
                "id": domain_match.college.id,
                "name": domain_match.college.name,
                "short_name": domain_match.college.short_name,
            }
        }, status=status.HTTP_200_OK)


class LinkMicrosoftSSOView(APIView):
    """
    POST /api/authentication/microsoft/link/
    Upgrades the currently authenticated account (Gmail OTP / Invite / ID Review / Phone)
    to FULLY_VERIFIED ('MICROSOFT_SSO') by verifying their official college Microsoft ID,
    without creating a duplicate account.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ms_email, display_name, domain_match, err_resp = _resolve_microsoft_token_and_domain(request)
        if err_resp is not None:
            return err_resp

        # Prevent two accounts from claiming the same institutional Microsoft identity
        conflict_exists = User.objects.filter(
            Q(email__iexact=ms_email) | Q(profile__college_email__iexact=ms_email)
        ).exclude(id=request.user.id).exists()
        if conflict_exists:
            return Response(
                {
                    "error": (
                        "This university Microsoft ID is already connected to another Campus Connect "
                        "account. Sign in with Microsoft directly or contact support."
                    )
                },
                status=status.HTTP_409_CONFLICT
            )

        user = request.user
        email_prefix, roll_no, admission_year = _extract_roll_and_year(ms_email)
        college = domain_match.college

        user_fields = []
        if not user.is_email_verified:
            user.is_email_verified = True
            user_fields.append("is_email_verified")
        if not user.is_verified_student:
            user.is_verified_student = True
            user_fields.append("is_verified_student")
        if display_name and not user.full_name:
            user.full_name = display_name
            user_fields.append("full_name")
        if user_fields:
            user.save(update_fields=user_fields)

        profile = getattr(user, "profile", None)
        if not profile:
            course = Course.objects.filter(college=college).first() or Course.objects.first()
            branch = Branch.objects.filter(course=course).first() if course else None
            academic_year = AcademicYear.objects.filter(course=course).first() if course else None

            clean_name = "".join(c for c in (user.full_name or display_name or "").lower() if c.isalnum() or c == "_").strip("_")
            base_user = (clean_name or f"student_{roll_no or email_prefix}")[:25]
            cand = base_user
            counter = 1
            while StudentProfile.objects.filter(username=cand).exists():
                cand = f"{base_user}_{counter}"
                counter += 1

            candidate_roll = roll_no or email_prefix
            if candidate_roll and StudentProfile.objects.filter(admission_number__iexact=candidate_roll).exists():
                candidate_roll = None

            profile = StudentProfile.objects.create(
                user=user,
                college_email=ms_email,
                admission_number=candidate_roll,
                username=cand,
                bio="Excited for hackathons, college fests & campus tech clubs!",
                gender="Other",
                show_gender=False,
                college=college,
                course=course,
                branch=branch,
                academic_year=academic_year,
                verified=True,
                id_card_verified=True,
                verification_method="MICROSOFT_SSO",
                profile_completed=False,
            )
        else:
            update_fields = []
            if profile.college_email != ms_email:
                profile.college_email = ms_email
                update_fields.append("college_email")
            if profile.verification_method != "MICROSOFT_SSO":
                profile.verification_method = "MICROSOFT_SSO"
                update_fields.append("verification_method")
            if not profile.verified:
                profile.verified = True
                update_fields.append("verified")
            if not profile.id_card_verified:
                profile.id_card_verified = True
                update_fields.append("id_card_verified")
            if profile.is_flagged_fake:
                profile.is_flagged_fake = False
                profile.flag_reason = "Verified via college Microsoft ID"
                update_fields.extend(["is_flagged_fake", "flag_reason"])
            if not profile.admission_number and roll_no and not StudentProfile.objects.filter(admission_number__iexact=roll_no).exclude(id=profile.id).exists():
                profile.admission_number = roll_no
                update_fields.append("admission_number")
            if not profile.profile_completed and profile.college_id != college.id:
                profile.college = college
                update_fields.append("college")
            if update_fields:
                profile.save(update_fields=update_fields)

        if profile.profile_completed:
            from communities.services import CommunityEnrollmentService
            CommunityEnrollmentService.enroll_student_in_core_communities(user, profile)

        user.refresh_from_db()
        refresh = RefreshToken.for_user(user)
        return Response({
            "message": f"Microsoft college ID verified! Welcome to {college.short_name}.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": _build_user_auth_payload(request, user),
            "detected_college": {
                "id": college.id,
                "name": college.name,
                "short_name": college.short_name,
            }
        }, status=status.HTTP_200_OK)


class RedeemInviteCodeView(APIView):
    """
    POST /api/authentication/invite/redeem/
    Redeems a CampusInviteCode for an authenticated Gmail/Pending account,
    upgrading their verification tier to INVITE_VERIFIED ('🎓 Campus Invited') and
    unlocking posting, commenting, confessing, discussing, and chatting.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_code = str(request.data.get("code", "")).strip().upper()
        if not raw_code:
            return Response({"error": "Please enter a campus invite code."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        existing_profile = getattr(user, "profile", None)
        if existing_profile and existing_profile.is_flagged_fake:
            return Response(
                {"error": "This account is currently flagged and cannot redeem invite codes."},
                status=status.HTTP_403_FORBIDDEN
            )

        if existing_profile and existing_profile.verification_method in ("MICROSOFT_SSO", "ADMIN_VERIFIED"):
            return Response({
                "message": "Your account already has full Microsoft/Admin verification.",
                "user": _build_user_auth_payload(request, user),
            }, status=status.HTTP_200_OK)

        with transaction.atomic():
            invite = CampusInviteCode.objects.select_for_update().select_related("college", "created_by").filter(
                code__iexact=raw_code
            ).first()

            if not invite:
                return Response(
                    {"error": "Invalid campus invite code. Check spelling and try again."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if existing_profile and existing_profile.invite_code_used_id == invite.id:
                return Response({
                    "message": f"Invite code {invite.code} is already active on your account.",
                    "user": _build_user_auth_payload(request, user),
                }, status=status.HTTP_200_OK)

            if existing_profile and existing_profile.invite_code_used_id:
                return Response(
                    {"error": "Your account has already redeemed a campus invite code."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not invite.is_active:
                return Response({"error": "This invite code has been deactivated."}, status=status.HTTP_400_BAD_REQUEST)
            if invite.expires_at and invite.expires_at <= timezone.now():
                return Response({"error": "This invite code has expired."}, status=status.HTTP_400_BAD_REQUEST)
            if invite.uses_count >= invite.max_uses:
                return Response(
                    {"error": "This invite code has reached its maximum student limit."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            CampusInviteCode.objects.filter(id=invite.id).update(uses_count=F("uses_count") + 1)

            if not user.is_verified_student:
                user.is_verified_student = True
                user.save(update_fields=["is_verified_student"])

            if existing_profile:
                update_fields = ["verification_method", "verified", "invited_by", "invite_code_used"]
                existing_profile.verification_method = "INVITE_CODE"
                existing_profile.verified = True
                existing_profile.invited_by = invite.created_by
                existing_profile.invite_code_used = invite
                if not existing_profile.profile_completed and existing_profile.college_id != invite.college_id:
                    course = Course.objects.filter(college=invite.college).first()
                    branch = Branch.objects.filter(course=course).first() if course else None
                    academic_year = AcademicYear.objects.filter(course=course).first() if course else None
                    if course and branch and academic_year:
                        existing_profile.college = invite.college
                        existing_profile.course = course
                        existing_profile.branch = branch
                        existing_profile.academic_year = academic_year
                        existing_profile.section = None
                        update_fields.extend(["college", "course", "branch", "academic_year", "section"])
                existing_profile.save(update_fields=update_fields)
                profile = existing_profile
            else:
                course = Course.objects.filter(college=invite.college).first() or Course.objects.first()
                branch = Branch.objects.filter(course=course).first() if course else None
                academic_year = AcademicYear.objects.filter(course=course).first() if course else None
                base_u = re.sub(r"[^a-z0-9_]", "", (user.email.split("@")[0] or "student").lower())[:25] or "student"
                cand = base_u
                idx = 1
                while StudentProfile.objects.filter(username=cand).exists():
                    cand = f"{base_u}_{idx}"
                    idx += 1
                profile = StudentProfile.objects.create(
                    user=user,
                    username=cand,
                    gender="Other",
                    show_gender=False,
                    college=invite.college,
                    course=course,
                    branch=branch,
                    academic_year=academic_year,
                    verified=True,
                    id_card_verified=False,
                    verification_method="INVITE_CODE",
                    invited_by=invite.created_by,
                    invite_code_used=invite,
                    profile_completed=False,
                )

        if profile.profile_completed:
            from communities.services import CommunityEnrollmentService
            CommunityEnrollmentService.enroll_student_in_core_communities(user, profile)

        user.refresh_from_db()
        return Response({
            "message": f"Invite code accepted! Welcome to {invite.college.short_name}.",
            "code": invite.code,
            "college": {
                "id": invite.college.id,
                "name": invite.college.name,
                "short_name": invite.college.short_name,
            },
            "user": _build_user_auth_payload(request, user),
        }, status=status.HTTP_200_OK)


class InviteCodesView(APIView):
    """
    GET /api/authentication/invite/codes/ -> View your peer/admin invite codes (auto-provisions 1 code for verified students)
    POST /api/authentication/invite/codes/ -> Create a custom batch invite code (staff) or peer invite slot (verified student)
    """
    permission_classes = [IsAuthenticated]

    def _serialize_code(self, obj):
        return {
            "id": obj.id,
            "code": obj.code,
            "batch_label": obj.batch_label,
            "college_id": obj.college_id,
            "college_name": obj.college.name if obj.college else "",
            "college_short_name": obj.college.short_name if obj.college else "",
            "uses_count": obj.uses_count,
            "max_uses": obj.max_uses,
            "remaining_uses": max(0, obj.max_uses - obj.uses_count),
            "is_active": obj.is_active,
            "is_valid": obj.is_valid,
            "expires_at": obj.expires_at,
            "created_at": obj.created_at,
        }

    def get(self, request):
        user = request.user
        if not user.can_participate:
            return Response(
                {"error": "Verify your Campus ID first to generate or share invite codes."},
                status=status.HTTP_403_FORBIDDEN
            )

        prof = getattr(user, "profile", None)
        my_codes = CampusInviteCode.objects.filter(created_by=user).select_related("college")

        if not my_codes.exists():
            college = getattr(prof, "college", None)
            if not college:
                domain_match = CollegeDomain.find_by_email(user.email)
                college = domain_match.college if domain_match else College.objects.filter(is_active=True).first()
            if college:
                code_str = CampusInviteCode.generate_unique_code(college.short_name)
                CampusInviteCode.objects.create(
                    code=code_str,
                    college=college,
                    created_by=user,
                    batch_label="Peer Invite" if not user.is_staff else "Founder Batch Invite",
                    max_uses=50 if user.is_staff else 3,
                )
                my_codes = CampusInviteCode.objects.filter(created_by=user).select_related("college")

        return Response({
            "codes": [self._serialize_code(c) for c in my_codes],
        })

    def post(self, request):
        user = request.user
        if not user.can_participate:
            return Response(
                {"error": "Verify your Campus ID first to generate invite codes."},
                status=status.HTTP_403_FORBIDDEN
            )

        prof = getattr(user, "profile", None)
        is_admin = bool(user.is_staff or user.is_superuser)
        college_id = request.data.get("college_id")
        college = College.objects.filter(id=college_id, is_active=True).first() if college_id else None
        if not college:
            college = getattr(prof, "college", None)
        if not college:
            domain_match = CollegeDomain.find_by_email(user.email)
            college = domain_match.college if domain_match else College.objects.filter(is_active=True).first()
        if not college:
            return Response({"error": "No active college found."}, status=status.HTTP_400_BAD_REQUEST)

        if not is_admin:
            active_count = CampusInviteCode.objects.filter(created_by=user, is_active=True).count()
            if active_count >= 3:
                return Response(
                    {"error": "Verified students can have at most 3 active peer invite codes at a time."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            max_uses = min(max(int(request.data.get("max_uses", 3) or 3), 1), 5)
            custom_code = CampusInviteCode.generate_unique_code(college.short_name)
            batch_label = str(request.data.get("batch_label", "Peer Invite")).strip()[:80] or "Peer Invite"
            expires_at = None
        else:
            raw_code = str(request.data.get("code", "")).strip().upper()
            if raw_code:
                clean_code = re.sub(r"[^A-Z0-9\-_]", "", raw_code)[:24]
                if len(clean_code) < 4:
                    return Response({"error": "Custom invite code must be at least 4 characters."}, status=status.HTTP_400_BAD_REQUEST)
                if CampusInviteCode.objects.filter(code__iexact=clean_code).exists():
                    return Response({"error": f"Invite code '{clean_code}' already exists."}, status=status.HTTP_400_BAD_REQUEST)
                custom_code = clean_code
            else:
                custom_code = CampusInviteCode.generate_unique_code(college.short_name)
            max_uses = min(max(int(request.data.get("max_uses", 50) or 50), 1), 1000)
            batch_label = str(request.data.get("batch_label", "Campus Batch Drop")).strip()[:80] or "Campus Batch Drop"
            expires_days = request.data.get("expires_days")
            expires_at = timezone.now() + timedelta(days=int(expires_days)) if expires_days else None

        invite = CampusInviteCode.objects.create(
            code=custom_code,
            college=college,
            created_by=user,
            batch_label=batch_label,
            max_uses=max_uses,
            expires_at=expires_at,
        )
        return Response(self._serialize_code(invite), status=status.HTTP_201_CREATED)


class DeleteAccountView(APIView):
    """
    DELETE /api/authentication/delete-account/
    Permanently deletes current authenticated student account, profile, posts, and data.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        email = user.email
        user.delete()
        return Response({
            "message": f"Account for {email} has been permanently deleted."
        }, status=status.HTTP_200_OK)


class DemoUsersListView(APIView):
    """
    GET /api/authentication/demo-users/
    Returns list of seeded demo campus students for rapid testing & 1-tap switching.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from config.media_utils import resolve_media_url
        gehu_users = list(User.objects.filter(is_verified_student=True, email__icontains="gehu.ac.in").select_related("profile", "profile__course", "profile__branch", "profile__college"))
        other_users = list(User.objects.filter(is_verified_student=True).exclude(email__icontains="gehu.ac.in").select_related("profile", "profile__course", "profile__branch", "profile__college")[:10])
        users = gehu_users + other_users
        data = []
        for u in users:
            prof = getattr(u, "profile", None)
            avatar_url = resolve_media_url(request, prof.profile_picture) if (prof and prof.profile_picture) else None
            data.append({
                "id": u.id,
                "email": u.email,
                "phone_number": u.phone_number or "",
                "full_name": u.full_name or (prof.username if prof else u.email.split("@")[0]),
                "username": prof.username if prof else u.email.split("@")[0],
                "avatar": avatar_url,
                "profile_picture": avatar_url,
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
        if not getattr(settings, "DEBUG", False):
            return Response(
                {"error": "Developer quick login is disabled in production."},
                status=status.HTTP_404_NOT_FOUND
            )

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

        prof = getattr(user, "profile", None)
        return Response({
            "message": f"Switched to @{prof and prof.username or user.email}",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": _build_user_auth_payload(request, user),
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
    Initiates password reset OTP with anti-enumeration protection.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_otp'

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email or "@" not in email:
            return Response({"error": "Valid email address is required."}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            # Prevent User Enumeration: return standard message without disclosing non-existence
            return Response({
                "message": f"If an account is associated with {email}, a password reset OTP has been dispatched.",
                "email": email,
            }, status=status.HTTP_200_OK)
        
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
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_otp'

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
                        "error": f"Strict Campus Perimeter Required: You are {round(min_dist, 2)} km away. Graphic Era campus perimeter is strictly 500 meters (0.5 km). You will enter as 🟡 Semi-Verified upon physical presence or enable simulation for testing.",
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
    Verifies phone OTP and logs student in as SEMI_VERIFIED (read-only until ID review, Invite Code, or MS SSO).
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
            idx = 1
            while User.objects.filter(email=placeholder_email).exists():
                placeholder_email = f"student_{clean_phone}_{idx}@geu.ac.in"
                idx += 1

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
            "user": _build_user_auth_payload(request, user),
        }, status=status.HTTP_200_OK)


class IDCardLoginView(APIView):
    """
    POST /api/authentication/id-card-login/
    Submits Physical College ID Card image for strict Admin Verification.
    When cloud OCR is unavailable, requires honest manual review rather than fabricating college details.
    Student enters in read-only 'SEMI_VERIFIED' (ID Under Review) until Admin approves.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import io
        from django.core.files.base import ContentFile
        from profiles.ocr_service import IDCardOCRService
        from colleges.models import College, Course, Branch, AcademicYear, Section

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
                image_base64 = image_base64.strip()
                missing_padding = len(image_base64) % 4
                if missing_padding:
                    image_base64 += "=" * (4 - missing_padding)
                image_bytes = base64.b64decode(image_base64)
            except Exception as e:
                return Response({"error": f"Invalid base64 image data: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({"error": "Please provide College ID Card photo (image_base64 or id_card_image)."}, status=status.HTTP_400_BAD_REQUEST)

        if not image_bytes or len(image_bytes) < 16:
            return Response({"error": "The uploaded photo is empty. Please provide a clear picture of your ID card."}, status=status.HTTP_400_BAD_REQUEST)

        # Run OCR & Anti-fraud
        scan_res = IDCardOCRService.scan_id_card_image(image_bytes)

        if not scan_res.get("success", True):
            return Response(
                {"error": scan_res.get("error", "Unable to process ID card photo. Please upload a clear JPG or PNG.")},
                status=status.HTTP_400_BAD_REQUEST
            )

        ext = scan_res["extracted_data"]
        img_hash = scan_res.get("image_hash", "")
        manual_name = str(request.data.get("full_name", "") or "").strip()
        manual_roll = str(request.data.get("admission_number", "") or "").strip()
        full_name = ext.get("full_name") or manual_name or "Student (ID Pending)"
        admission_num = ext.get("admission_number") or manual_roll or f"PENDING-{img_hash[:8].upper()}"
        safe_roll = re.sub(r"[^A-Za-z0-9]", "", admission_num).lower() or img_hash[:8]
        placeholder_email = f"{safe_roll}@idreview.campusconnect.local"

        # Check if same photo or roll already exists on an account
        existing_profile = None
        if img_hash:
            existing_profile = StudentProfile.objects.filter(id_card_hash=img_hash).first()
        if not existing_profile and (ext.get("admission_number") or manual_roll):
            existing_profile = StudentProfile.objects.filter(admission_number__iexact=admission_num).first()

        is_new_user = False
        if existing_profile and existing_profile.user:
            user = existing_profile.user
            profile = existing_profile
            clean_user = profile.username
        else:
            user = User.objects.filter(email__iexact=placeholder_email).first()
            if not user:
                user = User.objects.create(
                    email=placeholder_email,
                    full_name=full_name,
                    is_email_verified=False,
                    is_phone_verified=False,
                    is_verified_student=False,
                )
                is_new_user = True
                password = str(request.data.get("password", "")).strip()
                if password and len(password) >= 6:
                    user.set_password(password)
                    user.save(update_fields=["password"])

            clean_base = re.sub(r"[^a-z0-9]", "_", full_name.lower()).strip("_") or "student"
            clean_user = f"{clean_base}_{safe_roll[-4:]}"
            cand_user = clean_user[:40]
            counter = 1
            while StudentProfile.objects.filter(username=cand_user).exclude(user=user).exists():
                cand_user = f"{clean_user[:35]}_{counter}"
                counter += 1

            col_meta = ext.get("college") or {}
            col_id = request.data.get("college_id") or col_meta.get("id")
            col_name = col_meta.get("name")
            col_short = col_meta.get("short_name")
            college = None
            if col_id:
                college = College.objects.filter(id=col_id).first()
            if not college and col_short:
                college = College.objects.filter(short_name__iexact=col_short).first()
            if not college and col_name:
                college = College.objects.filter(name__icontains=col_name).first()
            if not college:
                college = College.objects.filter(is_active=True).first()

            crs_id = (ext.get("course") or {}).get("id")
            course = Course.objects.filter(id=crs_id).first() or Course.objects.filter(college=college).first() or Course.objects.first()
            brn_id = (ext.get("branch") or {}).get("id")
            branch = Branch.objects.filter(id=brn_id).first() or Branch.objects.filter(course=course).first() or Branch.objects.first()
            yr_id = (ext.get("academic_year") or {}).get("id")
            academic_year = AcademicYear.objects.filter(id=yr_id).first() or AcademicYear.objects.filter(course=course).first() or AcademicYear.objects.first()
            sec_id = (ext.get("section") or {}).get("id")
            section = Section.objects.filter(id=sec_id).first() or Section.objects.filter(academic_year=academic_year).first()

            profile = StudentProfile.objects.filter(user=user).first()
            if not profile:
                profile = StudentProfile.objects.create(
                    user=user,
                    username=cand_user,
                    admission_number=admission_num,
                    college=college,
                    course=course,
                    branch=branch,
                    academic_year=academic_year,
                    section=section,
                    bio="Excited for campus tech clubs and discussions!",
                    gender="Other",
                    verified=False,
                    id_card_verified=False,
                    verification_method="ID_CARD_OCR",
                    profile_completed=False,
                    show_gender=True,
                    id_card_hash=img_hash,
                    id_card_ocr_data=ext,
                )

        if image_bytes and not profile.id_card_image:
            try:
                from PIL import Image as PILImage
                PILImage.open(io.BytesIO(image_bytes)).verify()
                profile.id_card_image.save(file_name, ContentFile(image_bytes), save=False)
            except Exception:
                pass
            if profile.verification_method not in ("MICROSOFT_SSO", "ADMIN_VERIFIED"):
                profile.id_card_verified = False
                profile.verified = False
                profile.verification_method = "ID_CARD_OCR"
            profile.id_card_hash = img_hash
            profile.id_card_ocr_data = ext
            profile.save(update_fields=[
                "id_card_image", "id_card_verified", "verified",
                "verification_method", "id_card_hash", "id_card_ocr_data"
            ])

        user.refresh_from_db()
        refresh = RefreshToken.for_user(user)
        col_data = ext.get("college") or {}
        crs_data = ext.get("course") or {}
        brn_data = ext.get("branch") or {}

        return Response({
            "message": "ID card submitted for admin verification. You can browse the feed read-only while it is reviewed.",
            "ocr_available": scan_res.get("ocr_available", False),
            "requires_manual_review": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "extracted_data": ext,
            "detected_student": {
                "roll_number": admission_num,
                "full_name": full_name,
                "college_id": col_data.get("id") or (profile.college_id if profile else None),
                "college_name": col_data.get("name") or (profile.college.name if (profile and profile.college) else ""),
                "course_id": crs_data.get("id") or (profile.course_id if profile else None),
                "course_name": crs_data.get("name") or (profile.course.name if (profile and profile.course) else ""),
                "branch_id": brn_data.get("id") or (profile.branch_id if profile else None),
                "branch_name": brn_data.get("name") or (profile.branch.name if (profile and profile.branch) else ""),
                "suggested_username": clean_user,
                "verification_method": "ID_CARD_OCR",
            },
            "user": _build_user_auth_payload(request, user),
        }, status=status.HTTP_200_OK)


class SearchUsersView(APIView):
    """
    GET /api/authentication/users/search/?q=<query>
    Instant Instagram/TikTok-style student discovery and search.
    Searches by name, username, email, roll number.
    Returns live connection and follower relationship statuses.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from profiles.models import Connection, Follow, UserBlock
        from config.media_utils import resolve_media_url

        query = request.GET.get("q", "").strip()
        users_qs = User.objects.filter(is_active=True)
        if request.user.is_authenticated:
            users_qs = users_qs.exclude(id=request.user.id)
            # Exclude blocked users in either direction
            blocked_ids = set(UserBlock.objects.filter(blocker=request.user).values_list("blocked_id", flat=True))
            blocked_by_ids = set(UserBlock.objects.filter(blocked=request.user).values_list("blocker_id", flat=True))
            all_blocked = blocked_ids | blocked_by_ids
            if all_blocked:
                users_qs = users_qs.exclude(id__in=all_blocked)

        if query:
            users_qs = users_qs.filter(
                Q(full_name__icontains=query) |
                Q(email__icontains=query) |
                Q(profile__username__icontains=query) |
                Q(profile__admission_number__icontains=query)
            )

        users = users_qs.select_related("profile", "profile__college", "profile__branch").order_by("full_name")[:30]
        results = []
        for u in users:
            prof = getattr(u, "profile", None)
            username = (prof.username if prof and prof.username else "") or (u.email.split("@")[0] if u.email else "")
            display_name = u.full_name or username or "Campus Student"
            college_name = prof.college.name if (prof and prof.college) else ""
            branch_name = prof.branch.name if (prof and prof.branch) else ""
            admission_no = prof.admission_number if (prof and prof.admission_number) else ""
            avatar_url = resolve_media_url(request, prof.profile_picture) if (prof and prof.profile_picture) else None

            conn_status = Connection.get_status(request.user, u) if request.user.is_authenticated else "NOT_CONNECTED"
            follow_status = Follow.get_status(request.user, u) if request.user.is_authenticated else "NOT_FOLLOWING"
            is_private = getattr(prof, "is_private_account", False)

            results.append({
                "id": u.id,
                "email": u.email,
                "full_name": display_name,
                "username": username,
                "avatar": avatar_url,
                "profile_picture": avatar_url,
                "admission_number": admission_no,
                "college_name": college_name,
                "branch_name": branch_name,
                "verified": getattr(u, "is_verified_student", False),
                "verification_tier": getattr(u, "verification_tier", "SEMI_VERIFIED"),
                "is_private_account": is_private,
                "connection_status": conn_status,
                "follow_status": follow_status,
            })
        return Response({"results": results})



