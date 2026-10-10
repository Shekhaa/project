from django.urls import path
from .views import (
    MyCommunitiesView,
    AllCommunitiesView,
    CreateCustomCommunityView,
    CommunityDetailView,
    JoinLeaveCommunityView,
    CommunityGroupChatView,
)

urlpatterns = [
    path("me/", MyCommunitiesView.as_view(), name="my-communities"),
    path("", AllCommunitiesView.as_view(), name="all-communities"),
    path("create/", CreateCustomCommunityView.as_view(), name="community-create"),
    path("<slug:slug>/", CommunityDetailView.as_view(), name="community-detail"),
    path("<slug:slug>/toggle-join/", JoinLeaveCommunityView.as_view(), name="community-toggle-join"),
    path("<slug:slug>/chat/", CommunityGroupChatView.as_view(), name="community-chat"),
]
