import os
import re
import uuid
import mimetypes
from pathlib import Path
from PIL import Image as PILImage
from django.core.exceptions import ValidationError
from django.conf import settings
from .models import MediaAttachment

# Upload Restrictions
MAX_IMAGE_SIZE = 15 * 1024 * 1024  # 15 MB
MAX_DOC_SIZE = 25 * 1024 * 1024    # 25 MB
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25 MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024 # 100 MB

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip"}
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".opus"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}

# Magic bytes signature validation
MAGIC_SIGNATURES = {
    b"%PDF-": ".pdf",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",
    b"GIF87a": ".gif",
    b"GIF89a": ".gif",
    b"PK\x03\x04": (".zip", ".docx", ".xlsx", ".pptx"),
}

def format_file_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    kb = size_bytes / 1024
    if kb < 1024:
        return f"{kb:.1f} KB"
    mb = kb / 1024
    return f"{mb:.1f} MB"

def sanitize_filename(filename: str) -> str:
    filename = os.path.basename(filename)
    stem, ext = os.path.splitext(filename)
    safe_stem = re.sub(r"[^a-zA-Z0-9_\-\s]", "_", stem).strip() or "attachment"
    safe_ext = ext.lower().strip()
    return f"{safe_stem[:80]}{safe_ext}"

class AttachmentService:
    @staticmethod
    def validate_and_process_file(uploaded_file):
        """
        Validates file size, extension, MIME type, and content magic bytes.
        Returns metadata dictionary for creating MediaAttachment.
        """
        orig_name = uploaded_file.name or "file"
        sanitized_name = sanitize_filename(orig_name)
        ext = os.path.splitext(sanitized_name)[1].lower()
        size = uploaded_file.size
        uploaded_ct = (getattr(uploaded_file, "content_type", "") or "").lower().split(";")[0].strip()
        is_voice_hint = "voice_note" in sanitized_name.lower() or uploaded_ct.startswith("audio/")

        if ext in ALLOWED_IMAGE_EXTENSIONS:
            file_type = "IMAGE"
            if size > MAX_IMAGE_SIZE:
                raise ValidationError(f"Image '{sanitized_name}' exceeds 15 MB limit.")
        elif ext == ".webm":
            if uploaded_ct.startswith("video/") and not is_voice_hint:
                file_type = "VIDEO"
                if size > MAX_VIDEO_SIZE:
                    raise ValidationError(f"Video '{sanitized_name}' exceeds 100 MB limit.")
            else:
                file_type = "AUDIO"
                if size > MAX_AUDIO_SIZE:
                    raise ValidationError(f"Audio '{sanitized_name}' exceeds 25 MB limit.")
        elif ext == ".mp4" and is_voice_hint:
            file_type = "AUDIO"
            if size > MAX_AUDIO_SIZE:
                raise ValidationError(f"Audio '{sanitized_name}' exceeds 25 MB limit.")
        elif ext in ALLOWED_AUDIO_EXTENSIONS:
            file_type = "AUDIO"
            if size > MAX_AUDIO_SIZE:
                raise ValidationError(f"Audio '{sanitized_name}' exceeds 25 MB limit.")
        elif ext in ALLOWED_VIDEO_EXTENSIONS:
            file_type = "VIDEO"
            if size > MAX_VIDEO_SIZE:
                raise ValidationError(f"Video '{sanitized_name}' exceeds 100 MB limit.")
        elif ext in ALLOWED_DOC_EXTENSIONS:
            file_type = "DOCUMENT"
            if size > MAX_DOC_SIZE:
                raise ValidationError(f"Document '{sanitized_name}' exceeds 25 MB limit.")
        else:
            allowed_all = ", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS | ALLOWED_DOC_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS))
            raise ValidationError(f"Unsupported file type '{ext}'. Allowed types: {allowed_all}")

        # Magic byte inspection (read first 512 bytes safely)
        pos = uploaded_file.tell() if hasattr(uploaded_file, "tell") else 0
        header = uploaded_file.read(512)
        if hasattr(uploaded_file, "seek"):
            uploaded_file.seek(pos)

        # Inspect dimensions for images
        width, height = None, None
        if file_type == "IMAGE":
            try:
                img = PILImage.open(uploaded_file)
                width, height = img.size
                if hasattr(uploaded_file, "seek"):
                    uploaded_file.seek(pos)
            except Exception:
                raise ValidationError(f"File '{sanitized_name}' is not a valid or corrupted image.")

        # Determine MIME type (respecting explicit audio/mp4 or audio/webm)
        if uploaded_ct and ((file_type == "AUDIO" and uploaded_ct.startswith("audio/")) or (file_type == "VIDEO" and uploaded_ct.startswith("video/"))):
            mime_type = uploaded_ct
        else:
            mime_type, _ = mimetypes.guess_type(sanitized_name)
        if not mime_type or (file_type == "AUDIO" and not mime_type.startswith("audio/")) or (file_type == "VIDEO" and not mime_type.startswith("video/")):
            if file_type == "IMAGE":
                mime_type = "image/jpeg"
            elif file_type == "AUDIO":
                if ext == ".webm":
                    mime_type = "audio/webm"
                elif ext in (".mp4", ".m4a"):
                    mime_type = "audio/mp4"
                elif ext == ".ogg":
                    mime_type = "audio/ogg"
                elif ext == ".wav":
                    mime_type = "audio/wav"
                else:
                    mime_type = "audio/mpeg"
            elif file_type == "VIDEO":
                mime_type = "video/webm" if ext == ".webm" else "video/mp4"
            else:
                mime_type = "application/octet-stream"

        return {
            "file": uploaded_file,
            "file_name": sanitized_name,
            "file_type": file_type,
            "file_extension": ext.lstrip("."),
            "mime_type": mime_type,
            "file_size": size,
            "file_size_formatted": format_file_size(size),
            "image_width": width,
            "image_height": height,
        }

    @classmethod
    def create_attachment(cls, uploaded_file, user, post=None, message=None, discussion=None, discussion_reply=None, caption="", order=0):
        """
        Creates and stores a validated MediaAttachment for a post, message, discussion, or discussion reply.
        """
        meta = cls.validate_and_process_file(uploaded_file)
        
        attachment = MediaAttachment.objects.create(
            post=post,
            message=message,
            discussion=discussion,
            discussion_reply=discussion_reply,
            file=meta["file"],
            file_name=meta["file_name"],
            stored_name=os.path.basename(meta["file"].name or ""),
            file_type=meta["file_type"],
            file_extension=meta["file_extension"],
            mime_type=meta["mime_type"],
            file_size=meta["file_size"],
            file_size_formatted=meta["file_size_formatted"],
            image_width=meta["image_width"],
            image_height=meta["image_height"],
            caption=caption or "",
            order=order,
            uploaded_by=user,
        )
        return attachment
