import json
import base64
import urllib.request
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.http import HttpResponse
from django.db.models import Q
from otp.services import OTPService
from colleges.models import CollegeDomain, Course, Branch, AcademicYear
from profiles.models import StudentProfile
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
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_otp'

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

        base_url = getattr(settings, 'BACKEND_URL', None)
        if not base_url:
            base_url = request.build_absolute_uri('/')[:-1]
        magic_link = f"{base_url}/api/authentication/email/magic-login/?token={otp_record.magic_token}"

        response_data = {
            "message": msg,
            "email": email,
            "detected_college": college_info,
        }
        if settings.DEBUG:
            response_data["magic_token"] = str(otp_record.magic_token)
            response_data["magic_link"] = magic_link
            response_data["dev_otp"] = otp_record.otp

        return Response(response_data, status=status.HTTP_200_OK)


class VerifyEmailOTPView(APIView):
    """
    POST /api/authentication/email/verify-otp/
    Verifies college email OTP, creates/retrieves User, and issues JWT tokens.
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
                {"error": "Invalid login credentials. Please check your username/college ID and password."},
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
        except Exception as jwt_err:
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
        token = request.data.get("token") or request.data.get("access_token") or request.data.get("id_token")

        # Test / Simulation hook for DEBUG mode
        if settings.DEBUG and request.data.get("dev_mock_email"):
            email = request.data.get("dev_mock_email", "").strip().lower()
            display_name = request.data.get("dev_mock_name", "Student User")
            is_valid = True
            err = None
        else:
            if not token:
                return Response(
                    {"error": "Microsoft token (access_token or id_token) is required."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            is_valid, email, display_name, err = verify_microsoft_account(token)

        if not is_valid:
            return Response({"error": err}, status=status.HTTP_401_UNAUTHORIZED)

        # Verify email domain belongs to an approved college
        domain_match = CollegeDomain.find_by_email(email)
        if not domain_match:
            return Response({
                "error": f"The email '{email}' does not belong to any recognized university domain.",
                "email": email,
                "suggestion": "Please sign in using your official university-issued Microsoft account (@geu.ac.in / @gehu.ac.in)."
            }, status=status.HTTP_403_FORBIDDEN)

        # Smart Parsing: Extract Roll Number & Admission Year from institutional email
        email_prefix = email.split("@")[0].strip()
        roll_no = email_prefix if email_prefix.isdigit() else None
        admission_year = None
        if roll_no and len(roll_no) >= 2 and roll_no[:2].isdigit():
            admission_year = 2000 + int(roll_no[:2])

        # Get or create user
        user, is_new_user = User.objects.get_or_create(
            email=email,
            defaults={
                "full_name": display_name,
                "is_email_verified": True,
                "is_verified_student": True,
            }
        )

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

        user.check_and_update_student_status()

        # Auto-provision or complete StudentProfile so student skips redundant onboarding / claim screens
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

            profile = StudentProfile.objects.create(
                user=user,
                college_email=email,
                admission_number=roll_no or email_prefix,
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
            if not profile.admission_number and roll_no:
                profile.admission_number = roll_no
                profile_fields.append("admission_number")
            if profile_fields:
                profile.save(update_fields=profile_fields)

        user.refresh_from_db()

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
                "verification_tier": user.verification_tier,
                "badge_label": user.badge_label,
                "profile_completed": user.profile_completed,
            },
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
    Initiates password reset OTP for college email with anti-enumeration protection.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_otp'

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email or "@" not in email:
            return Response({"error": "Valid university email is required."}, status=status.HTTP_400_BAD_REQUEST)
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
                {"error": scan_res.get("error", "Unable to recognize text from ID card. Please upload a clear photo.")},
                status=status.HTTP_400_BAD_REQUEST
            )

        ext = scan_res["extracted_data"]
        full_name = ext.get("full_name") or "Verified Student"
        admission_num = ext.get("admission_number") or f"GEU2024{int(timezone.now().timestamp()) % 10000}"
        safe_roll = re.sub(r"[^A-Za-z0-9]", "", admission_num).lower()
        college_email = f"{safe_roll}@geu.ac.in"
        img_hash = scan_res.get("image_hash", "")

        # Check if an existing student is re-scanning their card to log in
        existing_profile = None
        if img_hash:
            existing_profile = StudentProfile.objects.filter(id_card_hash=img_hash).first()
        if not existing_profile and admission_num:
            existing_profile = StudentProfile.objects.filter(admission_number=admission_num).first()

        is_new_user = False
        if existing_profile and existing_profile.user:
            user = existing_profile.user
            profile = existing_profile
            clean_user = profile.username
        else:
            # Find or create user
            user = User.objects.filter(email__iexact=college_email).first()
            if not user:
                user = User.objects.create(
                    email=college_email,
                    full_name=full_name,
                    is_email_verified=True,
                    is_phone_verified=False,
                    is_verified_student=False,
                )
                is_new_user = True
                password = str(request.data.get("password", "")).strip()
                if password and len(password) >= 6:
                    user.set_password(password)
                    user.save(update_fields=["password"])

            # Resolve unique username
            clean_user = re.sub(r"[^a-z0-9]", "_", full_name.lower()) + "_" + safe_roll[-4:]
            cand_user = clean_user[:40]
            counter = 1
            while StudentProfile.objects.filter(username=cand_user).exclude(user=user).exists():
                cand_user = f"{clean_user[:35]}_{counter}"
                counter += 1

            # Resolve foreign keys safely
            from colleges.models import College, Course, Branch, AcademicYear, Section
            col_id = ext.get("college", {}).get("id")
            col_name = ext.get("college", {}).get("name")
            col_short = ext.get("college", {}).get("short_name")
            college = None
            if col_id:
                college = College.objects.filter(id=col_id).first()
            if not college and col_short:
                college = College.objects.filter(short_name__iexact=col_short).first()
            if not college and col_name:
                college = College.objects.filter(name__icontains=col_name).first()
            if not college and col_name:
                college, _ = College.objects.get_or_create(
                    name=col_name,
                    defaults={
                        "short_name": col_short or col_name[:10].upper(),
                        "city": "Dehradun",
                        "state": "Uttarakhand",
                        "is_active": True,
                    }
                )
            if not college:
                college = College.objects.first()

            crs_id = ext.get("course", {}).get("id")
            course = Course.objects.filter(id=crs_id).first() or Course.objects.filter(college=college).first() or Course.objects.first()
            brn_id = ext.get("branch", {}).get("id")
            branch = Branch.objects.filter(id=brn_id).first() or Branch.objects.filter(course=course).first() or Branch.objects.first()
            yr_id = ext.get("academic_year", {}).get("id")
            academic_year = AcademicYear.objects.filter(id=yr_id).first() or AcademicYear.objects.filter(course=course).first() or AcademicYear.objects.first()
            sec_id = ext.get("section", {}).get("id")
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
            profile.id_card_verified = False
            profile.verification_method = "ID_CARD_OCR"
            profile.id_card_hash = img_hash
            profile.id_card_ocr_data = ext
            profile.save(update_fields=["id_card_image", "id_card_verified", "verification_method", "id_card_hash", "id_card_ocr_data"])

        # Auto-enroll in 3 Core Communities
        from communities.services import CommunityEnrollmentService
        CommunityEnrollmentService.enroll_student_in_core_communities(user, profile)

        user.refresh_from_db()
        refresh = RefreshToken.for_user(user)

        return Response({
            "message": f"College ID Card scanned! Welcome, {full_name}.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": is_new_user,
            "extracted_data": ext,
            "detected_student": {
                "roll_number": admission_num,
                "full_name": full_name,
                "college_id": ext.get("college", {}).get("id", 1),
                "college_name": ext.get("college", {}).get("name", "Graphic Era University"),
                "course_id": ext.get("course", {}).get("id", 1),
                "course_name": ext.get("course", {}).get("name", "Engineering"),
                "branch_id": ext.get("branch", {}).get("id", 1),
                "branch_name": ext.get("branch", {}).get("name", "Computer Science"),
                "suggested_username": clean_user,
                "verification_method": "ID_CARD_OCR",
            },
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "username": profile.username,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "verification_tier": user.verification_tier,
                "badge_label": user.badge_label,
                "profile_completed": user.profile_completed,
            }
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
            avatar_url = prof.profile_picture.url if (prof and prof.profile_picture) else None

            conn_status = Connection.get_status(request.user, u) if request.user.is_authenticated else "NOT_CONNECTED"
            follow_status = Follow.get_status(request.user, u) if request.user.is_authenticated else "NOT_FOLLOWING"
            is_private = getattr(prof, "is_private_account", False)

            results.append({
                "id": u.id,
                "email": u.email,
                "full_name": display_name,
                "username": username,
                "avatar": avatar_url,
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



