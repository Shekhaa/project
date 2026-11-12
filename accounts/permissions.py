from rest_framework.permissions import BasePermission


class IsCampusVerified(BasePermission):
    """
    Requires an authenticated user who meets Campus Connect participation rules
    (verified college domain email/Microsoft SSO, valid Campus Invite Code,
    admin-approved student ID card, or staff).
    Read-only @gmail.com and pending ID accounts receive HTTP 403 with
    code='CAMPUS_VERIFICATION_REQUIRED'.
    """
    message = (
        "Verify your college Microsoft ID (@geu/@gehu), enter a Campus Invite Code, "
        "or wait for ID card review to unlock posting, commenting, and messaging."
    )

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if getattr(user, "can_participate", False):
            return True
        self.message = {
            "error": (
                "Verify your Campus ID or enter a Campus Invite Code to unlock posting, "
                "commenting, and messaging."
            ),
            "code": "CAMPUS_VERIFICATION_REQUIRED",
            "verification_tier": getattr(user, "verification_tier", "UNVERIFIED"),
            "badge_label": getattr(user, "badge_label", "⚪ Unverified"),
        }
        return False
