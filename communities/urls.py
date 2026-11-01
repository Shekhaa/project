from django.urls import path
from .views import (
    MyCommunitiesView,
    AllCommunitiesView,
    CreateCustomCommunityView,
    CommunityDetailView,
    JoinLeaveCommunityView,
    CommunityGroupChatView,
    CommunityDiscussionsView,
    DiscussionDetailView,
    DiscussionPinSolvedView,
    DiscussionRepliesView,
    DiscussionReplyDetailView,
    DiscussionVoteView,
    CommunityMembersView,
    CommunityMemberDetailView,
    CommunityReportsView,
    CommunityReportActionView,
)

urlpatterns = [
    path("me/", MyCommunitiesView.as_view(), name="my-communities"),
    path("", AllCommunitiesView.as_view(), name="all-communities"),
    path("create/", CreateCustomCommunityView.as_view(), name="community-create"),
    path("<slug:slug>/", CommunityDetailView.as_view(), name="community-detail"),
    path("<slug:slug>/toggle-join/", JoinLeaveCommunityView.as_view(), name="community-toggle-join"),
    path("<slug:slug>/chat/", CommunityGroupChatView.as_view(), name="community-chat"),
    
    # Discussions
    path("<slug:slug>/discussions/", CommunityDiscussionsView.as_view(), name="community-discussions"),
    path("<slug:slug>/discussions/<uuid:pk>/", DiscussionDetailView.as_view(), name="discussion-detail"),
    path("<slug:slug>/discussions/<uuid:pk>/vote/", DiscussionVoteView.as_view(), name="discussion-vote"),
    path("<slug:slug>/discussions/<uuid:pk>/pin/", DiscussionPinSolvedView.as_view(), {"action": "pin"}, name="discussion-pin"),
    path("<slug:slug>/discussions/<uuid:pk>/solve/", DiscussionPinSolvedView.as_view(), {"action": "solve"}, name="discussion-solve"),
    path("<slug:slug>/discussions/<uuid:pk>/replies/", DiscussionRepliesView.as_view(), name="discussion-replies"),
    path("<slug:slug>/discussions/<uuid:pk>/replies/<uuid:reply_id>/", DiscussionReplyDetailView.as_view(), name="discussion-reply-detail"),
    path("<slug:slug>/discussions/<uuid:pk>/replies/<uuid:reply_id>/accept/", DiscussionReplyDetailView.as_view(), name="discussion-reply-accept"),

    # Members & Roles
    path("<slug:slug>/members/", CommunityMembersView.as_view(), name="community-members"),
    path("<slug:slug>/members/<int:member_id>/", CommunityMemberDetailView.as_view(), name="community-member-detail"),

    # Moderation & Reports
    path("<slug:slug>/reports/", CommunityReportsView.as_view(), name="community-reports"),
    path("<slug:slug>/reports/<int:report_id>/action/", CommunityReportActionView.as_view(), name="community-report-action"),
]
