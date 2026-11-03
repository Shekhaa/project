from django.urls import path
from .views import (
    CompleteProfileView,
    MyProfileView,
    EditProfileView,
    ScanIDCardView,
    AdminIDCardAuditListView,
    AdminAuditActionView,
    ConnectionRequestView,
    RespondConnectionView,
    RemoveConnectionView,
    ListConnectionsView,
    FollowToggleView,
    UnfollowView,
    RespondFollowRequestView,
    ListFollowRequestsView,
    ListFollowersView,
    ListFollowingView,
    UserProfileDetailView,
    EndorseStudentView,
    UpdatePrivacySettingsView,
    BlockUserView,
    UnblockUserView,
)

urlpatterns = [
    path("complete/", CompleteProfileView.as_view(), name="profile-complete"),
    path("me/", MyProfileView.as_view(), name="profile-me"),
    path("edit/", EditProfileView.as_view(), name="profile-edit"),
    path("scan-id-card/", ScanIDCardView.as_view(), name="profile-scan-id-card"),
    path("admin/id-cards/", AdminIDCardAuditListView.as_view(), name="admin-id-cards"),
    path("admin/audit-user/", AdminAuditActionView.as_view(), name="admin-audit-user"),

    # Social Connections (LinkedIn style)
    path("connections/", ListConnectionsView.as_view(), name="profile-connections-list"),
    path("connections/request/", ConnectionRequestView.as_view(), name="profile-connection-request"),
    path("connections/<int:user_id>/respond/", RespondConnectionView.as_view(), name="profile-connection-respond"),
    path("connections/<int:user_id>/", RemoveConnectionView.as_view(), name="profile-connection-remove"),

    # Followers & Following (Instagram style)
    path("follow/requests/", ListFollowRequestsView.as_view(), name="profile-follow-requests"),
    path("follow/requests/<int:request_id>/respond/", RespondFollowRequestView.as_view(), name="profile-follow-respond"),
    path("follow/<int:user_id>/", FollowToggleView.as_view(), name="profile-follow"),
    path("unfollow/<int:user_id>/", UnfollowView.as_view(), name="profile-unfollow"),
    path("<int:user_id>/followers/", ListFollowersView.as_view(), name="profile-followers"),
    path("<int:user_id>/following/", ListFollowingView.as_view(), name="profile-following"),

    # Profile Privacy & Details
    path("<int:user_id>/", UserProfileDetailView.as_view(), name="profile-user-detail"),
    path("<int:user_id>/endorse/", EndorseStudentView.as_view(), name="profile-endorse"),
    path("settings/privacy/", UpdatePrivacySettingsView.as_view(), name="profile-privacy-settings"),
    path("block/<int:user_id>/", BlockUserView.as_view(), name="profile-block-user"),
    path("unblock/<int:user_id>/", UnblockUserView.as_view(), name="profile-unblock-user"),
]

