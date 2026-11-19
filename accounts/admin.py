from django.contrib import admin, messages
from django.utils.html import format_html, mark_safe
from .models import User


def approve_selected_students(modeladmin, request, queryset):
    count = 0
    for user in queryset:
        if not user.is_verified_student:
            user.is_verified_student = True
            user.save(update_fields=["is_verified_student"])
        prof = getattr(user, "profile", None)
        if prof:
            prof.id_card_verified = True
            prof.verified = True
            if prof.verification_method != "MICROSOFT_SSO":
                prof.verification_method = "ADMIN_VERIFIED"
            prof.is_flagged_fake = False
            prof.flag_reason = f"Approved by admin ({request.user.email})"
            prof.save(update_fields=[
                "id_card_verified", "verified", "verification_method", "is_flagged_fake", "flag_reason"
            ])
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=user,
                    sender=request.user,
                    notification_type="ANNOUNCEMENT",
                    title="Campus ID Approved",
                    message="Your Student ID has been verified by the admin team. Posting, confessing & chatting are now unlocked!",
                )
            except Exception:
                pass

            try:
                from otp.services import OTPService
                if user.email and not user.email.endswith(".local"):
                    col_name = prof.college.name if prof.college else "your university"
                    OTPService.dispatch_real_email(
                        user.email,
                        "Campus Connect ID Approved 🎉",
                        f"Hi {user.full_name or prof.username},\n\n"
                        f"Great news! Your Student ID card for {col_name} has been verified by campus admins.\n\n"
                        "Your account now has full access to post, discuss, and chat across campus.\n\n"
                        "Open Campus Connect: https://project-mobile-plum.vercel.app\n\n"
                        "Best,\nCampusConnect Team"
                    )
            except Exception:
                pass
        count += 1
    modeladmin.message_user(request, f"Successfully approved {count} user(s) as Verified Campus Students.", messages.SUCCESS)


def reject_or_revoke_students(modeladmin, request, queryset):
    count = 0
    for user in queryset:
        if user.is_verified_student:
            user.is_verified_student = False
            user.save(update_fields=["is_verified_student"])
        prof = getattr(user, "profile", None)
        if prof:
            prof.is_flagged_fake = True
            prof.id_card_verified = False
            prof.verified = False
            prof.flag_reason = f"Flagged / revoked by admin ({request.user.email})"
            prof.save(update_fields=["is_flagged_fake", "id_card_verified", "verified", "flag_reason"])
            try:
                from notifications.models import Notification
                Notification.objects.create(
                    recipient=user,
                    sender=request.user,
                    notification_type="ANNOUNCEMENT",
                    title="ID Verification Notice",
                    message="Your student verification has been revoked or requires re-verification with a valid ID card.",
                )
            except Exception:
                pass
        count += 1
    modeladmin.message_user(request, f"Revoked verification / flagged {count} user(s).", messages.WARNING)


def delete_selected_users_and_profiles(modeladmin, request, queryset):
    count = 0
    for user in queryset:
        if user.is_superuser and user == request.user:
            continue  # Don't delete logged-in admin
        user.delete()
        count += 1
    modeladmin.message_user(request, f"Permanently deleted {count} user account(s) and their linked profiles.", messages.SUCCESS)


approve_selected_students.short_description = "✅ Approve selected Users as Verified Campus Students"
reject_or_revoke_students.short_description = "❌ Reject / Revoke Student Verification"
delete_selected_users_and_profiles.short_description = "🗑️ Delete selected Users and linked Profiles"


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = (
        "id_card_thumb",
        "email",
        "full_name",
        "student_username",
        "student_college",
        "is_verified_student",
        "verification_tier_badge",
        "is_email_verified",
        "is_active",
        "created_at",
    )
    list_display_links = ("id_card_thumb", "email")
    search_fields = ("email", "full_name", "phone_number", "profile__username", "profile__admission_number")
    list_filter = (
        "is_verified_student",
        "is_email_verified",
        "is_phone_verified",
        "is_active",
        "is_staff",
    )
    ordering = ("-created_at",)
    actions = [approve_selected_students, reject_or_revoke_students, delete_selected_users_and_profiles]

    def student_username(self, obj):
        prof = getattr(obj, "profile", None)
        return f"@{prof.username}" if prof else mark_safe('<span style="color:#999;">—</span>')
    student_username.short_description = "Username"

    def student_college(self, obj):
        prof = getattr(obj, "profile", None)
        if prof and prof.college:
            city_str = f" • {prof.college.city}" if getattr(prof.college, "city", None) else ""
            return f"{prof.college.short_name}{city_str}"
        return mark_safe('<span style="color:#999;">—</span>')
    student_college.short_description = "College"

    def id_card_thumb(self, obj):
        prof = getattr(obj, "profile", None)
        if prof:
            url = None
            if prof.id_card_ocr_data and isinstance(prof.id_card_ocr_data, dict):
                url = prof.id_card_ocr_data.get("image_data_uri")
            if not url and prof.id_card_image:
                try:
                    url = prof.id_card_image.url
                except Exception:
                    pass
            if url:
                return format_html(
                    '<a href="{}" target="_blank" title="Click to view full image in new tab">'
                    '<img src="{}" style="height: 45px; max-width: 75px; border-radius: 4px; border: 1px solid #ccc; object-fit: cover;" />'
                    '</a>',
                    url, url
                )
        return mark_safe('<span style="color:#bbb;">—</span>')
    id_card_thumb.short_description = "ID Photo"

    def verification_tier_badge(self, obj):
        tier = obj.verification_tier
        if tier == "FULLY_VERIFIED":
            return mark_safe('<span style="background:#e6f4ea; color:#137333; padding: 2px 8px; border-radius: 12px; font-weight:600; font-size:11px;">🛡️ Verified</span>')
        elif tier == "INVITE_VERIFIED":
            return mark_safe('<span style="background:#e8f0fe; color:#1a73e8; padding: 2px 8px; border-radius: 12px; font-weight:600; font-size:11px;">🎓 Invited</span>')
        elif tier == "SEMI_VERIFIED":
            return mark_safe('<span style="background:#fef7e0; color:#b06000; padding: 2px 8px; border-radius: 12px; font-weight:600; font-size:11px;">🟡 ID Review</span>')
        return mark_safe('<span style="background:#f1f3f4; color:#5f6368; padding: 2px 8px; border-radius: 12px; font-size:11px;">⚪ Unverified</span>')
    verification_tier_badge.short_description = "Status Badge"

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        prof = getattr(obj, "profile", None)
        if prof:
            if obj.is_verified_student:
                if not prof.id_card_verified or not prof.verified:
                    prof.id_card_verified = True
                    prof.verified = True
                    if prof.verification_method != "MICROSOFT_SSO":
                        prof.verification_method = "ADMIN_VERIFIED"
                    prof.is_flagged_fake = False
                    prof.save(update_fields=["id_card_verified", "verified", "verification_method", "is_flagged_fake"])
            else:
                if prof.id_card_verified or prof.verified:
                    prof.id_card_verified = False
                    prof.verified = False
                    prof.save(update_fields=["id_card_verified", "verified"])
