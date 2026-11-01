import random
import re
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Exists, OuterRef
from django.contrib.auth import get_user_model
from communities.models import Community, CommunityMember
from notifications.views import create_notification
from attachments.services import AttachmentService
from .models import Post, PostImage, PostLike, Comment
from .serializers import PostSerializer, CommentSerializer, ANONYMOUS_MASCOTS
from .pagination import FeedPagination

User = get_user_model()

class FeedView(generics.ListAPIView):
    """
    GET /api/posts/feed/
    Fetches the customized student timeline supporting GLOBAL, COLLEGE, and COMMUNITY scopes.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PostSerializer
    pagination_class = FeedPagination

    def get_queryset(self):
        user = self.request.user
        user_community_ids = list(CommunityMember.objects.filter(
            user=user
        ).values_list("community_id", flat=True))

        user_college = getattr(getattr(user, "profile", None), "college", None)

        scope_param = self.request.query_params.get("scope", "").upper()
        community_param = self.request.query_params.get("community")

        if community_param:
            qs_filter = Q(community_id=community_param)
        elif scope_param == "GLOBAL":
            qs_filter = Q(visibility="GLOBAL")
        elif scope_param == "COLLEGE":
            if user_college:
                qs_filter = Q(visibility="COLLEGE", author__profile__college=user_college)
            else:
                qs_filter = Q(visibility="COLLEGE")
        elif scope_param == "COMMUNITY":
            qs_filter = Q(visibility="COMMUNITY", community_id__in=user_community_ids)
        else:
            college_q = Q(visibility="COLLEGE", author__profile__college=user_college) if user_college else Q(visibility="COLLEGE")
            qs_filter = (
                Q(visibility="GLOBAL") |
                college_q |
                Q(community_id__in=user_community_ids)
            )

        qs = (
            Post.objects.filter(
                qs_filter,
                is_deleted=False
            )
            .select_related("author", "author__profile", "author__profile__college", "community")
            .prefetch_related("images", "attachments", "comments")
            .annotate(
                likes_count=Count("likes", distinct=True),
                comments_count=Count("comments", distinct=True)
            )
            .order_by("-created_at")
        )
        if user.is_authenticated:
            qs = qs.annotate(
                user_has_liked=Exists(PostLike.objects.filter(post=OuterRef("pk"), user=user))
            )
        return qs


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

        qs = (
            Post.objects.filter(community=community, is_deleted=False)
            .select_related("author", "author__profile", "author__profile__college", "community")
            .prefetch_related("images", "attachments", "comments")
            .annotate(
                likes_count=Count("likes", distinct=True),
                comments_count=Count("comments", distinct=True)
            )
            .order_by("-created_at")
        )
        if self.request.user.is_authenticated:
            qs = qs.annotate(
                user_has_liked=Exists(PostLike.objects.filter(post=OuterRef("pk"), user=self.request.user))
            )
        return qs


class CreatePostView(APIView):
    """
    POST /api/posts/create/
    Creates a new post with GLOBAL, COLLEGE, or COMMUNITY visibility.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        visibility = request.data.get("visibility", "COLLEGE")
        if isinstance(visibility, list):
            visibility = visibility[0]
        visibility = str(visibility).upper()
        if visibility not in ["GLOBAL", "COLLEGE", "COMMUNITY"]:
            visibility = "COLLEGE"

        community_id = request.data.get("community")
        if isinstance(community_id, list):
            community_id = community_id[0]

        # Auto-resolve community if not specified
        if not community_id:
            user_college = getattr(getattr(user, "profile", None), "college", None)
            if user_college:
                college_comm = Community.objects.filter(name=user_college.name, community_type="COLLEGE").first()
                if college_comm:
                    community_id = college_comm.id

        post_data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        post_data["visibility"] = visibility
        if community_id:
            post_data["community"] = community_id

        serializer = PostSerializer(data=post_data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        post = serializer.save(author=request.user)

        # Handle unified attachments (images, PDFs, documents)
        attachments = request.FILES.getlist("attachments") or request.FILES.getlist("files")
        for idx, att_file in enumerate(attachments):
            try:
                AttachmentService.create_attachment(
                    uploaded_file=att_file,
                    user=request.user,
                    post=post,
                    order=idx
                )
            except Exception as e:
                # Still allow post creation even if an attachment fails
                pass

        # Handle legacy multiple image uploads
        images = request.FILES.getlist("images")
        for img in images:
            PostImage.objects.create(post=post, image=img)

        # Handle legacy document/PDF upload
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
