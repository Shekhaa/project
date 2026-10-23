import random
import re
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from django.contrib.auth import get_user_model
from communities.models import Community, CommunityMember
from notifications.views import create_notification
from .models import Post, PostImage, PostLike, Comment
from .serializers import PostSerializer, CommentSerializer, ANONYMOUS_MASCOTS
from .pagination import FeedPagination

User = get_user_model()

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

        # Handle document/PDF upload
        doc = request.FILES.get("document")
        if doc:
            post.document = doc
            if not post.document_name:
                post.document_name = doc.name
            size_kb = doc.size / 1024
            post.document_size = f"{size_kb:.1f} KB" if size_kb < 1024 else f"{(size_kb/1024):.1f} MB"
            post.media_type = "DOCUMENT"
            post.save(update_fields=["document", "document_name", "document_size", "media_type"])

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
            # Send notification to post author if not liking own post
            sender_name = request.user.full_name or request.user.email.split("@")[0]
            create_notification(
                recipient=post.author,
                sender=request.user,
                notification_type='LIKE',
                title='New Like ❤️',
                message=f"{sender_name} liked your campus post.",
                data={'post_id': post.id}
            )
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

        # Dispatch notifications for reply / comment / @mentions
        sender_name = "Anonymous Student" if is_anonymous else (request.user.full_name or request.user.email.split("@")[0])
        notified_user_ids = {request.user.id}

        if parent and parent.user and parent.user.id not in notified_user_ids:
            notified_user_ids.add(parent.user.id)
            create_notification(
                recipient=parent.user,
                sender=request.user if not is_anonymous else None,
                notification_type='REPLY',
                title='New Reply 💬',
                message=f"{sender_name} replied to your comment on a campus post.",
                data={'post_id': post.id, 'comment_id': comment.id}
            )
        elif not parent and post.author and post.author.id not in notified_user_ids:
            notified_user_ids.add(post.author.id)
            create_notification(
                recipient=post.author,
                sender=request.user if not is_anonymous else None,
                notification_type='COMMENT',
                title='New Comment 💬',
                message=f"{sender_name} commented on your campus post.",
                data={'post_id': post.id, 'comment_id': comment.id}
            )

        # Parse @mentions for tagging notifications
        mention_tags = set(re.findall(r'@([a-zA-Z0-9_\.]+)', text))
        for tag in mention_tags:
            matching_users = User.objects.filter(
                Q(email__istartswith=tag) | Q(full_name__icontains=tag)
            ).exclude(id__in=notified_user_ids)[:3]

            for tagged_user in matching_users:
                notified_user_ids.add(tagged_user.id)
                create_notification(
                    recipient=tagged_user,
                    sender=request.user if not is_anonymous else None,
                    notification_type='TAG',
                    title='You were tagged 🏷️',
                    message=f"{sender_name} mentioned you in a comment.",
                    data={'post_id': post.id, 'comment_id': comment.id}
                )

        serializer = CommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)



class DeletePostView(APIView):
    """
    DELETE /api/posts/<post_id>/delete/
    Soft-deletes a post so it no longer appears in feed or communities.
    Only the post author or staff can delete the post.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_deleted=False)
        if post.author != request.user and not request.user.is_staff:
            return Response(
                {"error": "You do not have permission to delete this post."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        post.is_deleted = True
        post.save(update_fields=["is_deleted"])
        return Response({"message": "Post deleted successfully.", "id": post_id})


class ArchivePostView(APIView):
    """
    POST /api/posts/<post_id>/archive/
    Archives a post (removes from public feed).
    Only the post author or staff can archive the post.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id, is_deleted=False)
        if post.author != request.user and not request.user.is_staff:
            return Response(
                {"error": "You do not have permission to archive this post."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        post.is_deleted = True
        post.save(update_fields=["is_deleted"])
        return Response({"message": "Post archived successfully.", "id": post_id, "archived": True})
