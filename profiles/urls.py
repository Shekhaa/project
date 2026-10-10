from django.urls import path
from .views import (
    CompleteProfileView,
    MyProfileView,
    EditProfileView,
    ScanIDCardView,
    AdminIDCardAuditListView,
    AdminAuditActionView,
)

urlpatterns = [
    path("complete/", CompleteProfileView.as_view(), name="profile-complete"),
    path("me/", MyProfileView.as_view(), name="profile-me"),
    path("edit/", EditProfileView.as_view(), name="profile-edit"),
    path("scan-id-card/", ScanIDCardView.as_view(), name="profile-scan-id-card"),
    path("admin/id-cards/", AdminIDCardAuditListView.as_view(), name="admin-id-cards"),
    path("admin/audit-user/", AdminAuditActionView.as_view(), name="admin-audit-user"),
]
