from django.urls import path
from .views import (
    AttachmentDownloadView,
    AttachmentSignedUrlView,
    AttachmentUploadView,
    AttachmentDeleteView,
)

urlpatterns = [
    path("upload/", AttachmentUploadView.as_view(), name="attachment-upload"),
    path("<uuid:attachment_id>/signed-url/", AttachmentSignedUrlView.as_view(), name="attachment-signed-url"),
    path("<uuid:attachment_id>/download/", AttachmentDownloadView.as_view(), name="attachment-download"),
    path("<uuid:attachment_id>/", AttachmentDeleteView.as_view(), name="attachment-delete"),
]
