import random
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Count
from communities.models import Community, CommunityMember
from .models import Post, PostImage, PostLike, Comment
from .serializers import PostSerializer, CommentSerializer, ANONYMOUS_MASCOTS
from .pagination import FeedPagination

class FeedView(generics.ListAPIView):
    """
    GET /api/posts/feed/
    Fetches the customized student timeline consisting of posts from all
    mandatory & joined communities the student belongs to.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PostSerializer
    pagination_class = FeedPagination

    def get_queryset(self):
        user_community_ids = CommunityMember.objects.filter(
            user=self.request.user
        ).values_list("community_id", flat=True)

        return (
            Post.objects.filter(
                community_id__in=user_community_ids,
                is_deleted=False
            )
            .select_related("author", "author__profile", "community")
            .prefetch_related("images", "likes", "comments")
            .annotate(
                likes_count=Count("likes", distinct=True),
                comments_count=Count("comments", distinct=True)
            )
            .order_by("-created_at")
        )


class CommunityFeedView(generics.ListAPIView):
    """
    GET /api/posts/community/<slug>/
    Timeline filtered for a single specific community or student club.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PostSerializer
    pagination_class = FeedPagination

    def get_queryset(self):
        community_slug = self.kwargs["slug"]
        community = get_object_or_404(Community, slug=community_slug)

        return (
            Post.objects.filter(community=community, is_deleted=False)
            .select_related("author", "author__profile", "community")
            .prefetch_related("images", "likes", "comments")
            .annotate(
                likes_count=Count("likes", distinct=True),
                comments_count=Count("comments", distinct=True)
            )
            .order_by("-created_at")
        )


class CreatePostView(APIView):
    """
    POST /api/posts/create/
    Creates a new post with text, optional anonymity, and multiple image uploads.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PostSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        post = serializer.save(author=request.user)

        # Handle multiple image uploads
        images = request.FILES.getlist("images")
        for img in images:
            PostImage.objects.create(post=post, image=img)

        output_serializer = PostSerializer(post, context={"request": request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class PostDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PostSerializer
    queryset = Post.objects.filter(is_deleted=False)


class ToggleLikeView(APIView):
    """
    POST /api/posts/<post_id>/like/
    Toggles heart like on a post.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_deleted=False)
        like_query = PostLike.objects.filter(post=post, user=request.user)

        if like_query.exists():
            like_query.delete()
            count = post.likes.count()
            return Response({
                "liked": False,
                "has_liked": False,
                "message": "Post unliked.",
                "total_likes": count,
                "likes_count": count
            })
        else:
            PostLike.objects.create(post=post, user=request.user)
            count = post.likes.count()
            return Response({
                "liked": True,
                "has_liked": True,
                "message": "Post liked.",
                "total_likes": count,
                "likes_count": count
            })


class PostCommentsView(APIView):
    """
    GET /api/posts/<post_id>/comments/  -> List comments
    POST /api/posts/<post_id>/comments/ -> Post new comment or reply
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_deleted=False)
        comments = post.comments.filter(parent=None).select_related("user", "user__profile").prefetch_related("replies")
        serializer = CommentSerializer(comments, many=True)
        return Response(serializer.data)

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_deleted=False)
        text = request.data.get("text", "").strip()
        if not text:
            return Response({"error": "Comment text cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        parent_id = request.data.get("parent_id")
        parent = Comment.objects.filter(id=parent_id, post=post).first() if parent_id else None

        is_anonymous = request.data.get("is_anonymous", False)
        alias = random.choice(ANONYMOUS_MASCOTS) if is_anonymous else ""

        comment = Comment.objects.create(
            post=post,
            user=request.user,
            parent=parent,
            text=text,
            is_anonymous=is_anonymous,
            anonymous_alias=alias
        )

        serializer = CommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
