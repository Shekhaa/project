from django.contrib import admin, messages
from django.utils.html import format_html, mark_safe
from .models import StudentProfile, PendingIDCardApproval


def approve_selected_id_cards(modeladmin, request, queryset):
    count = 0
    for profile in queryset:
        profile.id_card_verified = True
        profile.verified = True
        if profile.verification_method != "MICROSOFT_SSO":
            profile.verification_method = "ADMIN_VERIFIED"
        profile.is_flagged_fake = False
        profile.flag_reason = f"Approved by admin ({request.user.email})"
        profile.save(update_fields=[
            "id_card_verified", "verified", "verification_method", "is_flagged_fake", "flag_reason"
        ])
        user = profile.user
        if not user.is_verified_student:
            user.is_verified_student = True
            user.save(update_fields=["is_verified_student"])
        try:
            from notifications.models import Notification
            Notification.objects.create(
                recipient=user,
                sender=request.user,
                notification_type="SYSTEM",
                title="Campus ID Approved",
                message="Your Student ID has been verified by the admin team. Posting, confessing & chatting are now unlocked!",
            )
        except Exception:
            pass

        try:
            from otp.services import OTPService
            if user.email and not user.email.endswith(".local"):
                col_name = profile.college.name if profile.college else "your university"
                OTPService.dispatch_real_email(
                    user.email,
                    "Campus Connect ID Approved 🎉",
                    f"Hi {user.full_name or profile.username},\n\n"
                    f"Great news! Your Student ID card for {col_name} has been verified by campus admins.\n\n"
                    "Your account now has full access to post, discuss, and chat across campus.\n\n"
                    "Open Campus Connect: https://project-mobile-plum.vercel.app\n\n"
                    "Best,\nCampusConnect Team"
                )
        except Exception:
            pass
        count += 1
    modeladmin.message_user(request, f"Successfully approved {count} student ID card(s).", messages.SUCCESS)


def reject_or_flag_fake(modeladmin, request, queryset):
    count = 0
    for profile in queryset:
        profile.is_flagged_fake = True
        profile.id_card_verified = False
        profile.verified = False
        profile.flag_reason = f"Flagged / rejected by admin ({request.user.email})"
        profile.save(update_fields=["is_flagged_fake", "id_card_verified", "verified", "flag_reason"])
        user = profile.user
        if user.is_verified_student:
            user.is_verified_student = False
            user.save(update_fields=["is_verified_student"])
        try:
            from notifications.models import Notification
            Notification.objects.create(
                recipient=user,
                sender=request.user,
                notification_type="SYSTEM",
                title="ID Verification Notice",
                message="Your uploaded ID card photo could not be verified. Please upload a clearer photo from Profile Settings.",
            )
        except Exception:
            pass
        count += 1
    modeladmin.message_user(request, f"Flagged {count} profile(s) as invalid/fake.", messages.WARNING)


approve_selected_id_cards.short_description = "✅ Approve selected Student ID Cards (Unlock full access)"
reject_or_flag_fake.short_description = "❌ Reject / Flag selected ID Cards as Fake"


@admin.register(PendingIDCardApproval)
class PendingIDCardApprovalAdmin(admin.ModelAdmin):
    list_display = (
        "id_card_photo",
        "student_full_name",
        "student_email",
        "college",
        "admission_number",
        "course",
        "branch",
        "created_at",
    )
    list_display_links = ("id_card_photo", "student_full_name")
    list_filter = ("college", "course", "created_at")
    search_fields = ("username", "user__email", "user__full_name", "admission_number")
    actions = [approve_selected_id_cards, reject_or_flag_fake]
    readonly_fields = ("id_card_large_preview", "id_card_ocr_data", "id_card_hash", "created_at")
    fields = (
        "user",
        "id_card_large_preview",
        "college",
        "course",
        "branch",
        "admission_number",
        "id_card_verified",
        "verified",
        "is_flagged_fake",
        "flag_reason",
        "id_card_ocr_data",
        "id_card_hash",
        "created_at",
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(
            id_card_image__isnull=False,
            id_card_verified=False,
            is_flagged_fake=False,
        ).exclude(id_card_image="").select_related("user", "college", "course", "branch")

    def student_full_name(self, obj):
        return obj.user.full_name or obj.username
    student_full_name.short_description = "Student Name"

    def student_email(self, obj):
        return obj.user.email
    student_email.short_description = "Contact Email"

    def id_card_photo(self, obj):
        if obj.id_card_image:
            url = obj.id_card_image.url
            return format_html(
                '<a href="{}" target="_blank" title="Click to view full image in new tab">'
                '<img src="{}" style="height: 60px; max-width: 100px; border-radius: 6px; border: 1px solid #ccc; object-fit: cover;" />'
                '</a>',
                url, url
            )
        return mark_safe('<span style="color: #999;">No Image</span>')
    id_card_photo.short_description = "ID Photo"

    def id_card_large_preview(self, obj):
        if obj.id_card_image:
            url = obj.id_card_image.url
            return format_html(
                '<div style="margin: 10px 0;">'
                '<a href="{}" target="_blank">'
                '<img src="{}" style="max-height: 380px; max-width: 100%; border-radius: 8px; border: 1px solid #999; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />'
                '</a>'
                '<p style="color: #666; font-size: 11px; margin-top: 4px;">Click image to open full resolution in new tab</p>'
                '</div>',
                url, url
            )
        return "No image uploaded"
    id_card_large_preview.short_description = "ID Card Preview"


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = (
        "id_card_photo",
        "username",
        "student_full_name",
        "college",
        "course",
        "verified",
        "id_card_verified",
        "verification_method",
        "is_flagged_fake",
        "created_at",
    )
    list_display_links = ("id_card_photo", "username")
    list_filter = (
        "id_card_verified",
        "verified",
        "verification_method",
        "is_flagged_fake",
        "college",
        "course",
    )
    search_fields = ("username", "user__email", "user__full_name", "admission_number")
    actions = [approve_selected_id_cards, reject_or_flag_fake]
    readonly_fields = ("id_card_large_preview", "id_card_ocr_data", "id_card_hash")

    def student_full_name(self, obj):
        return obj.user.full_name or obj.username
    student_full_name.short_description = "Full Name"

    def id_card_photo(self, obj):
        if obj.id_card_image:
            url = obj.id_card_image.url
            return format_html(
                '<a href="{}" target="_blank" title="Click to view full image in new tab">'
                '<img src="{}" style="height: 50px; max-width: 85px; border-radius: 4px; border: 1px solid #ccc; object-fit: cover;" />'
                '</a>',
                url, url
            )
        return mark_safe('<span style="color: #bbb;">—</span>')
    id_card_photo.short_description = "ID Photo"

    def id_card_large_preview(self, obj):
        if obj.id_card_image:
            url = obj.id_card_image.url
            return format_html(
                '<div style="margin: 10px 0;">'
                '<a href="{}" target="_blank">'
                '<img src="{}" style="max-height: 380px; max-width: 100%; border-radius: 8px; border: 1px solid #999; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" />'
                '</a>'
                '<p style="color: #666; font-size: 11px; margin-top: 4px;">Click image to open full resolution in new tab</p>'
                '</div>',
                url, url
            )
        return "No image uploaded"
    id_card_large_preview.short_description = "ID Card Preview"

