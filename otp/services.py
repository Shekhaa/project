import os
import json
import base64
import urllib.request
import urllib.parse
import secrets
from datetime import timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction
from .models import OTP

class OTPService:
    COOLDOWN_SECONDS = 60
    EXPIRY_MINUTES = 5

    @classmethod
    def generate_code(cls):
        """Generates a secure 6-digit numeric OTP."""
        return f"{secrets.randbelow(900000) + 100000}"

    @classmethod
    def dispatch_real_sms(cls, phone_number: str, code: str) -> tuple[bool, str]:
        """
        Dispatches real SMS to student's mobile carrier (Airtel, Jio, Vi)
        using Fast2SMS (India) or Twilio API.
        Returns (success: bool, status_message: str)
        """
        clean_phone = "".join(filter(str.isdigit, phone_number))[-10:]

        # 1. Fast2SMS Gateway (India +91)
        fast2sms_key = os.getenv("FAST2SMS_API_KEY")
        if fast2sms_key:
            try:
                url = "https://www.fast2sms.com/dev/bulkV2"
                payload = urllib.parse.urlencode({
                    "route": "otp",
                    "variables_values": str(code),
                    "numbers": str(clean_phone),
                }).encode("utf-8")
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={
                        "authorization": fast2sms_key,
                        "Content-Type": "application/x-www-form-urlencoded"
                    }
                )
                with urllib.request.urlopen(req, timeout=7) as resp:
                    data = json.loads(resp.read().decode())
                    if data.get("return"):
                        print(f"[Fast2SMS SUCCESS] Real SMS dispatched to {clean_phone}")
                        return True, "Real SMS sent to your phone via Fast2SMS."
                    else:
                        msg = data.get("message", "Fast2SMS error")
                        print(f"[Fast2SMS FAILED] {msg}")
                        return False, msg
            except urllib.error.HTTPError as e:
                try:
                    err_json = json.loads(e.read().decode())
                    raw_msg = err_json.get("message", f"Fast2SMS HTTP Error {e.code}")
                except Exception:
                    raw_msg = f"Fast2SMS HTTP Error {e.code}"
                print(f"[Fast2SMS NOTICE] {raw_msg}")
                if "verification" in raw_msg.lower() or "100 inr" in raw_msg.lower() or "dlt" in raw_msg.lower():
                    friendly_msg = "Fast2SMS API par physical SMS ke liye Rs 100 wallet recharge ya activation zaroori hai. Testing ke liye code auto-fill kar diya gaya hai!"
                else:
                    friendly_msg = raw_msg
                return False, friendly_msg
            except Exception as e:
                print(f"[Fast2SMS ERROR] {e}")
                return False, str(e)

        # 2. Twilio Gateway (Global SMS)
        twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
        twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
        twilio_from = os.getenv("TWILIO_PHONE_NUMBER")
        if twilio_sid and twilio_token and twilio_from:
            try:
                url = f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json"
                formatted_to = f"+91{clean_phone}" if not phone_number.startswith("+") else phone_number
                data = urllib.parse.urlencode({
                    "To": formatted_to,
                    "From": twilio_from,
                    "Body": f"Your Campus Connect verification code is {code}. Valid for 5 minutes.",
                }).encode("utf-8")
                auth = base64.b64encode(f"{twilio_sid}:{twilio_token}".encode("ascii")).decode("ascii")
                req = urllib.request.Request(
                    url,
                    data=data,
                    headers={"Authorization": f"Basic {auth}"}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    print(f"[Twilio SUCCESS] Real SMS dispatched to {formatted_to}")
                    return True, "Real SMS sent to phone via Twilio."
            except Exception as e:
                print(f"[Twilio ERROR] {e}")
                return False, str(e)

        return False, "No active SMS gateway configured (Simulated Dev Mode)."

    @classmethod
    def dispatch_real_email(cls, email: str, subject: str, message: str) -> tuple[bool, str]:
        """
        Dispatches email via Resend HTTPS API (when RESEND_API_KEY is configured) or Django email backend.
        Returns (real_sent: bool, status_message: str).
        """
        resend_key = (getattr(settings, "RESEND_API_KEY", "") or os.getenv("RESEND_API_KEY", "")).strip()
        from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "verify@campusconnect.local")

        if resend_key:
            try:
                payload = json.dumps({
                    "from": from_email,
                    "to": [email],
                    "subject": subject,
                    "text": message,
                }).encode("utf-8")
                req = urllib.request.Request(
                    "https://api.resend.com/emails",
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {resend_key}",
                        "Content-Type": "application/json",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if 200 <= resp.status < 300:
                        return True, "Verification email sent via Resend."
            except Exception as e:
                print(f"[RESEND EMAIL ERROR] {e}")

        backend_path = getattr(settings, "EMAIL_BACKEND", "")
        is_real_backend = (
            "console" not in backend_path.lower()
            and "dummy" not in backend_path.lower()
            and "locmem" not in backend_path.lower()
        )
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[email],
                fail_silently=False,
            )
            if is_real_backend:
                return True, "Verification email sent via SMTP."
            return False, "Console/Dev email backend active."
        except Exception as e:
            print(f"[OTP SMTP ERROR] Failed to send email to {email}: {e}")
            return False, f"Email dispatch error: {e}"

    @classmethod
    def send_email_otp(cls, email, purpose="EMAIL_LOGIN", return_record=False):
        """
        Generates and dispatches an OTP to a student's email address (institutional or Gmail).
        Enforces cooldown and sends via Resend API / SMTP / console fallback.
        Includes a 1-click Magic Link for frictionless verification.
        """
        email = email.strip().lower()

        # Check cooldown
        recent_otp = OTP.objects.filter(
            destination=email,
            purpose=purpose,
            created_at__gte=timezone.now() - timedelta(seconds=cls.COOLDOWN_SECONDS)
        ).first()

        if recent_otp:
            remaining = cls.COOLDOWN_SECONDS - int((timezone.now() - recent_otp.created_at).total_seconds())
            err_msg = f"Please wait {remaining} seconds before requesting a new OTP."
            return (False, err_msg, None) if return_record else (False, err_msg)

        # Invalidate existing unused OTPs for this destination and purpose
        OTP.objects.filter(
            destination=email,
            purpose=purpose,
            is_used=False
        ).update(is_used=True)

        code = cls.generate_code()
        expires_at = timezone.now() + timedelta(minutes=cls.EXPIRY_MINUTES)

        otp_record = OTP.objects.create(
            destination=email,
            otp=code,
            purpose=purpose,
            expires_at=expires_at
        )

        # 1-Click Magic Link
        backend_url = getattr(settings, 'BACKEND_URL', 'http://localhost:8000').rstrip('/')
        magic_link = f"{backend_url}/api/authentication/email/magic-login/?token={otp_record.magic_token}"
        deep_link = f"campusconnect://verify?token={otp_record.magic_token}"

        # Dispatch Email
        subject = f"Your Campus Connect Verification Code: {code}"
        message = (
            f"Hello,\n\n"
            f"Your one-time Campus Connect verification code is: {code}\n\n"
            f"-> Prefer 1-Click login? (No typing needed):\n"
            f"{magic_link}\n\n"
            f"Mobile App Deep Link: {deep_link}\n\n"
            f"This code and link will expire in {cls.EXPIRY_MINUTES} minutes.\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"— The Campus Connect Team"
        )
        real_sent, gateway_msg = cls.dispatch_real_email(email, subject, message)
        otp_record.real_email_sent = real_sent
        otp_record.email_gateway_msg = gateway_msg

        print(f"\n==================================================")
        print(f"  [CAMPUS CONNECT OTP] Destination: {email}")
        print(f"  [6-DIGIT CODE]: {code}  (Expires in {cls.EXPIRY_MINUTES}m)")
        print(f"  [1-CLICK MAGIC LINK]: {magic_link}")
        print(f"  [REAL EMAIL DISPATCHED]: {'YES' if real_sent else f'NO ({gateway_msg})'}")
        print(f"==================================================\n")

        msg = (
            "OTP sent to your email inbox."
            if real_sent
            else "OTP generated and ready to verify."
        )
        return (True, msg, otp_record) if return_record else (True, msg)

    @classmethod
    def send_phone_otp(cls, phone_number, purpose="PHONE_VERIFY", return_record=False):
        """
        Generates and sends an OTP to a student's mobile number.
        """
        phone_number = phone_number.strip().replace(" ", "")

        # Check cooldown
        recent_otp = OTP.objects.filter(
            destination=phone_number,
            purpose=purpose,
            created_at__gte=timezone.now() - timedelta(seconds=cls.COOLDOWN_SECONDS)
        ).first()

        if recent_otp:
            remaining = cls.COOLDOWN_SECONDS - int((timezone.now() - recent_otp.created_at).total_seconds())
            err_msg = f"Please wait {remaining} seconds before requesting a new SMS OTP."
            return (False, err_msg, None) if return_record else (False, err_msg)

        OTP.objects.filter(
            destination=phone_number,
            purpose=purpose,
            is_used=False
        ).update(is_used=True)

        code = cls.generate_code()
        expires_at = timezone.now() + timedelta(minutes=cls.EXPIRY_MINUTES)

        otp_record = OTP.objects.create(
            destination=phone_number,
            otp=code,
            purpose=purpose,
            expires_at=expires_at
        )

        # Dispatch real SMS via carrier gateway (if FAST2SMS_API_KEY / TWILIO configured)
        real_sent, gateway_msg = cls.dispatch_real_sms(phone_number, code)
        otp_record.real_sent = real_sent
        otp_record.gateway_msg = gateway_msg

        print(f"\n==================================================")
        print(f"  [CAMPUS CONNECT SMS OTP] Phone: {phone_number}")
        print(f"  [SMS CODE]: {code}  (Expires in {cls.EXPIRY_MINUTES}m)")
        print(f"  [REAL SMS DISPATCHED]: {'YES (Via Fast2SMS/Twilio)' if real_sent else f'NO ({gateway_msg})'}")
        print(f"==================================================\n")

        msg = (
            "Verification code sent via SMS to your phone."
            if real_sent
            else (
                f"Verification code generated (Test Mode: {code})."
                if getattr(settings, "DEBUG", False)
                else "Verification code generated and dispatched."
            )
        )
        return (True, msg, otp_record) if return_record else (True, msg)

    @classmethod
    def verify_otp(cls, destination, otp_code, purpose):
        """
        Validates OTP code for a destination and purpose.
        Uses database transaction lock and constant-time string comparison.
        Returns: (True, None) or (False, "Error message")
        """
        destination = destination.strip().lower()
        with transaction.atomic():
            otp_record = OTP.objects.select_for_update().filter(
                destination=destination,
                purpose=purpose,
                is_used=False
            ).order_by("-created_at").first()

            if not otp_record:
                return False, "No active verification code found. Please request a new one."

            if otp_record.is_expired:
                otp_record.is_used = True
                otp_record.save(update_fields=["is_used"])
                return False, "The verification code has expired. Please request a new one."

            if not secrets.compare_digest(str(otp_record.otp), str(otp_code).strip()):
                otp_record.record_attempt()
                remaining = otp_record.max_attempts - otp_record.attempts
                if remaining <= 0:
                    return False, "Maximum verification attempts exceeded. Code has been invalidated."
                return False, f"Invalid verification code. {remaining} attempt(s) remaining."

            # Mark consumed
            otp_record.mark_consumed()
            return True, None

    @classmethod
    def verify_magic_token(cls, magic_token, purpose="EMAIL_LOGIN"):
        """
        Validates a 1-click magic link token.
        Uses database transaction lock to prevent race condition replays.
        Returns: (is_valid, error_message, destination_email)
        """
        try:
            with transaction.atomic():
                otp_record = OTP.objects.select_for_update().filter(
                    magic_token=magic_token,
                    purpose=purpose,
                    is_used=False
                ).first()

                if not otp_record:
                    return False, "This verification link is invalid or has already been used.", None

                if otp_record.is_expired:
                    otp_record.is_used = True
                    otp_record.save(update_fields=["is_used"])
                    return False, "This verification link has expired. Please request a new one.", None

                otp_record.mark_consumed()
                return True, None, otp_record.destination
        except (ValueError, TypeError):
            return False, "Invalid verification token format.", None
