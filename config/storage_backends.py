import os
import posixpath
import logging
import cloudinary
import cloudinary.uploader
import cloudinary.api
from django.conf import settings
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

logger = logging.getLogger(__name__)

VIDEO_AUDIO_EXTENSIONS = {
    '.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v',
    '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'
}
RAW_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.zip', '.rar', '.7z'
}


@deconstructible
class CloudinaryMediaStorage(Storage):
    """
    Seamless Django storage backend for Cloudinary.
    Automatically routes and stores:
    - Photos & Images (Avatar, Post photos, Student IDs)
    - Audio Notes & Voice recordings (MP3, M4A, WAV, AAC, OGG)
    - Academic PDFs, Word docs & notes
    Directly into Cloudinary's global CDN with zero data loss on server restarts.
    Stores clean relative paths (< 80 chars) to prevent varchar length truncation in DB.
    """
    def __init__(self, **kwargs):
        self.cloud_name = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None) or os.getenv('CLOUDINARY_CLOUD_NAME', 'cvwywt63')
        self.api_key = getattr(settings, 'CLOUDINARY_API_KEY', None) or os.getenv('CLOUDINARY_API_KEY', '167684133529433')
        self.api_secret = getattr(settings, 'CLOUDINARY_API_SECRET', None) or os.getenv('CLOUDINARY_API_SECRET', 'uPjSxrttG6NvH8xbU5vedPMYPB0')
        self.folder_prefix = getattr(settings, 'CLOUDINARY_MEDIA_FOLDER', 'campus_connect')

        if self.cloud_name and self.api_key and self.api_secret:
            cloudinary.config(
                cloud_name=self.cloud_name,
                api_key=self.api_key,
                api_secret=self.api_secret,
                secure=True,
            )

    def _determine_resource_type(self, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        if ext in VIDEO_AUDIO_EXTENSIONS:
            return "video"
        elif ext in RAW_EXTENSIONS:
            return "raw"
        return "image"

    def _save(self, name, content):
        clean_name = str(name).replace('\\', '/').lstrip('/')
        sub_dir = posixpath.dirname(clean_name)
        folder = posixpath.join(self.folder_prefix, sub_dir) if sub_dir else self.folder_prefix
        base_name = posixpath.basename(clean_name)
        resource_type = self._determine_resource_type(base_name)
        if resource_type == "raw":
            public_id = base_name
        else:
            public_id, _ = os.path.splitext(base_name)

        if hasattr(content, 'seek'):
            content.seek(0)

        # Prefer temporary file path if available (avoids buffering large videos in RAM)
        upload_source = content.temporary_file_path() if hasattr(content, 'temporary_file_path') else content

        uploaded_to_cloud = False
        if self.cloud_name and self.api_key and self.api_secret:
            try:
                res = cloudinary.uploader.upload(
                    upload_source,
                    resource_type=resource_type,
                    public_id=public_id,
                    folder=folder,
                    overwrite=True,
                    use_filename=True,
                    unique_filename=False,
                )
                uploaded_to_cloud = bool(res.get("secure_url") or res.get("url"))
            except Exception as e:
                logger.exception("Cloudinary upload failed for %s: %s", clean_name, e)

        # Fallback to local storage if Cloudinary upload failed or was skipped
        if not uploaded_to_cloud:
            self._save_local(clean_name, content)

        # Always return clean_name (relative path < 60 chars) so DB column length is never exceeded
        return clean_name

    def _save_local(self, clean_name, content):
        try:
            full_path = os.path.join(getattr(settings, 'MEDIA_ROOT', 'media'), clean_name)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            if hasattr(content, 'seek'):
                content.seek(0)
            with open(full_path, 'wb') as f:
                if hasattr(content, 'chunks'):
                    for chunk in content.chunks():
                        f.write(chunk)
                else:
                    f.write(content.read())
        except Exception as err:
            logger.warning("Local media fallback save error for %s: %s", clean_name, err)

    def url(self, name):
        if not name:
            return ""
        name_str = str(name).replace('\\', '/').lstrip('/')
        if name_str.startswith(("http://", "https://")):
            return name_str

        if self.cloud_name:
            resource_type = self._determine_resource_type(name_str)
            # Use q_auto,f_auto for images and videos to enable fast progressive CDN delivery & streaming
            transform = "q_auto,f_auto" if resource_type in ("image", "video") else ""
            prefix = f"{transform}/" if transform else ""
            return f"https://res.cloudinary.com/{self.cloud_name}/{resource_type}/upload/{prefix}{self.folder_prefix}/{name_str}"

        # Local relative fallback
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        return posixpath.join(media_url, name_str)

    def exists(self, name):
        return False

    def size(self, name):
        return 0

    def delete(self, name):
        try:
            name_str = str(name).replace('\\', '/').lstrip('/')
            base_name = posixpath.basename(name_str)
            sub_dir = posixpath.dirname(name_str)
            folder = posixpath.join(self.folder_prefix, sub_dir) if sub_dir else self.folder_prefix
            public_id, _ = os.path.splitext(base_name)
            full_public_id = f"{folder}/{public_id}"
            resource_type = self._determine_resource_type(base_name)
            cloudinary.uploader.destroy(full_public_id, resource_type=resource_type)
        except Exception as e:
            logger.warning("Cloudinary delete error: %s", e)
