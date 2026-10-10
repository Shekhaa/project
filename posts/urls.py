from django.urls import path
from .views import (
    FeedView,
    CommunityFeedView,
    CreatePostView,
    PostDetailView,
    ToggleLikeView,
    PostCommentsView,
)

urlpatterns = [
    path("", FeedView.as_view(), name="post-list"),
    path("feed/", FeedView.as_view(), name="post-feed"),
    path("create/", CreatePostView.as_view(), name="post-create"),
    path("<int:pk>/", PostDetailView.as_view(), name="post-detail"),
    path("<int:post_id>/like/", ToggleLikeView.as_view(), name="post-toggle-like"),
    path("<int:post_id>/comments/", PostCommentsView.as_view(), name="post-comments"),
    path("community/<slug:slug>/", CommunityFeedView.as_view(), name="community-posts"),
]
