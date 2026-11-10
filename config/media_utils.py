import io
import uuid
from PIL import Image as PILImage, ImageOps
from django.core.files.base import ContentFile


def resolve_media_url(request, file_or_url):
    """
    Resolves a Django FileField / ImageField or stored string path to a canonical URL.
    When `request` is present, builds an absolute URI and upgrades HTTP -> HTTPS
    if the originating request arrived over HTTPS.
    """
    if not file_or_url:
        return None

    if hasattr(file_or_url, "url"):
        try:
            raw_url = file_or_url.url
        except Exception:
            return None
    else:
        raw_url = str(file_or_url)

    if not raw_url:
        return None

    if raw_url.startswith(("data:", "blob:")):
        return raw_url

    if raw_url.startswith(("http://", "https://")):
        if raw_url.startswith("http://") and request and request.is_secure():
            return "https://" + raw_url[len("http://"):]
        return raw_url

    if request:
        abs_url = request.build_absolute_uri(raw_url)
        if abs_url.startswith("http://") and request.is_secure():
            return "https://" + abs_url[len("http://"):]
        return abs_url

    return raw_url


def process_avatar_image(image_bytes: bytes, user_id: int, max_dim: int = 512, quality: int = 88):
    """
    Validates, EXIF-orients, resizes, and compresses a profile avatar image to JPEG.
    Raises ValueError if the payload is empty or cannot be decoded as an image.
    Returns (ContentFile, unique_filename).
    """
    if not image_bytes or len(image_bytes) < 8:
        raise ValueError("Uploaded profile image is empty or invalid.")

    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            background = PILImage.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if "A" in img.getbands() else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        img.thumbnail((max_dim, max_dim), PILImage.Resampling.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        buf.seek(0)
        filename = f"avatar_{user_id}_{uuid.uuid4().hex[:8]}.jpg"
        return ContentFile(buf.read(), name=filename), filename
    except Exception as exc:
        raise ValueError(f"Could not process profile image: {exc}") from exc
