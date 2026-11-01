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

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip"}

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

        if ext in ALLOWED_IMAGE_EXTENSIONS:
            file_type = "IMAGE"
            if size > MAX_IMAGE_SIZE:
                raise ValidationError(f"Image '{sanitized_name}' exceeds 15 MB limit.")
        elif ext in ALLOWED_DOC_EXTENSIONS:
            file_type = "DOCUMENT"
            if size > MAX_DOC_SIZE:
                raise ValidationError(f"Document '{sanitized_name}' exceeds 25 MB limit.")
        else:
            allowed_all = ", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS | ALLOWED_DOC_EXTENSIONS))
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

        # Determine MIME type
        mime_type, _ = mimetypes.guess_type(sanitized_name)
        if not mime_type:
            mime_type = "image/jpeg" if file_type == "IMAGE" else "application/octet-stream"

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
    def create_attachment(cls, uploaded_file, user, post=None, message=None, caption="", order=0):
        """
        Creates and stores a validated MediaAttachment for a post or message.
        """
        meta = cls.validate_and_process_file(uploaded_file)
        
        attachment = MediaAttachment.objects.create(
            post=post,
            message=message,
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
