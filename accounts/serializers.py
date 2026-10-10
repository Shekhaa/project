from rest_framework import serializers
from colleges.models import CollegeDomain
from .models import User

class SendEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        email = value.strip().lower()
        domain_match = CollegeDomain.find_by_email(email)
        if not domain_match:
            domain = email.split("@")[-1] if "@" in email else email
            raise serializers.ValidationError(
                f"The domain '{domain}' is not authorized. Please use your valid college-issued email."
            )
        return email


class VerifyEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(max_length=6, min_length=4, required=True)
    password = serializers.CharField(min_length=6, required=False, allow_blank=True, allow_null=True)


class SendPhoneOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, min_length=10, required=True)

    def validate_phone_number(self, value):
        cleaned = value.strip().replace(" ", "").replace("-", "")
        return cleaned


class VerifyPhoneOTPSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=15, min_length=10, required=True)
    otp = serializers.CharField(max_length=6, min_length=4, required=True)
    password = serializers.CharField(min_length=6, required=False, allow_blank=True, allow_null=True)

    def validate_phone_number(self, value):
        return value.strip().replace(" ", "").replace("-", "")


class SetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=6, write_only=True, required=True)
    confirm_password = serializers.CharField(min_length=6, write_only=True, required=True)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return attrs


class LoginWithPasswordSerializer(serializers.Serializer):
    email = serializers.CharField(required=False)
    identifier = serializers.CharField(required=False)
    password = serializers.CharField(required=True, write_only=True)


class UserMeSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()
    primary_device = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone_number",
            "is_email_verified",
            "is_phone_verified",
            "is_verified_student",
            "verification_tier",
            "badge_label",
            "last_login_device",
            "profile_completed",
            "primary_device",
            "profile",
            "created_at",
        ]

    def get_profile(self, obj):
        if hasattr(obj, "profile"):
            p = obj.profile
            return {
                "id": p.id,
                "username": p.username,
                "bio": p.bio,
                "gender": p.gender,
                "profile_picture": p.profile_picture.url if p.profile_picture else None,
                "college": {
                    "id": p.college_id,
                    "name": p.college.name,
                    "short_name": p.college.short_name,
                } if p.college else None,
                "course": {"id": p.course_id, "name": p.course.name} if p.course else None,
                "branch": {"id": p.branch_id, "name": p.branch.name} if p.branch else None,
                "academic_year": {"id": p.academic_year_id, "display_name": p.academic_year.display_name} if p.academic_year else None,
                "section": {"id": p.section_id, "name": p.section.name} if p.section else None,
                "profile_completed": p.profile_completed,
            }
        return None

    def get_primary_device(self, obj):
        device = obj.devices.filter(is_primary=True, is_active=True).first()
        if device:
            return {
                "device_name": device.device_name,
                "device_uuid": device.device_uuid,
                "os": device.os,
                "last_login": device.last_login,
            }
        return None
