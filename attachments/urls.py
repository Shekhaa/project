from django.urls import path
from .views import (
    AttachmentDownloadView,
    AttachmentUploadView,
    AttachmentDeleteView,
)

urlpatterns = [
    path("upload/", AttachmentUploadView.as_view(), name="attachment-upload"),
    path("<uuid:attachment_id>/download/", AttachmentDownloadView.as_view(), name="attachment-download"),
    path("<uuid:attachment_id>/", AttachmentDeleteView.as_view(), name="attachment-delete"),
]
