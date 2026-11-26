import re
from django.utils.html import strip_tags

USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9@_]{3,30}$")
SCRIPT_PATTERN = re.compile(r"(?i)<script.*?>.*?</script>|javascript:|on\w+\s*=")


def validate_campus_username(raw_username: str) -> tuple[str, str | None]:
    """
    Allows only alphanumeric characters, '@' and '_' (e.g. shekha@rana, shekhar_r).
    Rejects special/injection characters like ^, &, <, >, ;, spaces, etc.
    """
    clean = str(raw_username or "").strip().lower()
    if not clean:
        return "", "Username cannot be empty."
    if len(clean) < 3 or len(clean) > 30:
        return clean, "Username must be between 3 and 30 characters."
    if not USERNAME_REGEX.match(clean):
        return clean, "Username can only contain letters, numbers, '@' and '_' (no special symbols like ^ or &)."
    return clean, None


def sanitize_user_text(raw_text: str) -> str:
    """
    Strips script blocks, inline JS event handlers, and HTML tags from user-supplied text.
    """
    if not raw_text:
        return ""
    cleaned = SCRIPT_PATTERN.sub("", str(raw_text))
    return strip_tags(cleaned).strip()
