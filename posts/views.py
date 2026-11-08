import random
import re
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Exists, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
from django.contrib.auth import get_user_model
from communities.models import Community, CommunityMember
from notifications.views import create_notification
from attachments.services import AttachmentService
from profiles.models import Connection, Follow, UserBlock, StudentProfile
from .models import Post, PostImage, PostLike, Comment
from .serializers import PostSerializer, CommentSerializer, ANONYMOUS_MASCOTS
from .pagination import FeedPagination

User = get_user_model()


def annotate_post_metrics(queryset, user=None):
    """
    Annotates Post queryset with indexed Subquery counts for likes and comments,
    and Exists() for user_has_liked, completely eliminating Cartesian product join overhead.
    """
    likes_sub = Subquery(
        PostLike.objects.filter(post=OuterRef("pk")).values("post").annotate(c=Count("id")).values("c")[:1],
        output_field=IntegerField()
    )
    comments_sub = Subquery(
        Comment.objects.filter(post=OuterRef("pk")).values("post").annotate(c=Count("id")).values("c")[:1],
        output_field=IntegerField()
    )
    qs = queryset.annotate(
        likes_count=Coalesce(likes_sub, 0),
        comments_count=Coalesce(comments_sub, 0),
    )
    if user and user.is_authenticated:
        qs = qs.annotate(
            user_has_liked=Exists(PostLike.objects.filter(post=OuterRef("pk"), user=user))
        )
    return qs


class FeedView(generics.ListAPIView):
    """
    GET /api/posts/feed/
    Fetches the customized student timeline supporting GLOBAL, COLLEGE, FOLLOWERS, CONNECTIONS, and COMMUNITY scopes.
    Enforces relationship and profile privacy filters:
    - Excludes posts from blocked users.
    - Excludes posts from private accounts unless viewer is an approved follower or author.
    - Scopes: ALL, GLOBAL, COLLEGE, FOLLOWERS, CONNECTIONS, COMMUNITY, MEDIA, RESOURCES.
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

        # 1. Social graph relationship IDs
        followed_ids = list(Follow.objects.filter(follower=user, status="ACCEPTED").values_list("following_id", flat=True))

        # 2. Blocked user IDs (bidirectional) - single fast query
        blocked_rows = UserBlock.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list("blocker_id", "blocked_id")
        all_blocked_ids = {uid for pair in blocked_rows for uid in pair if uid != user.id}

        scope_param = self.request.query_params.get("scope", "").upper()
        community_param = self.request.query_params.get("community")
        ids_param = self.request.query_params.get("ids")

        # Base permitted visibility filter for current user
        college_q = Q(visibility="COLLEGE", author__profile__college=user_college) if user_college else Q(visibility="COLLEGE")
        base_permitted = (
            Q(author=user) |
            Q(visibility="GLOBAL") |
            college_q |
            Q(visibility="FOLLOWERS", author_id__in=followed_ids) |
            Q(community_id__in=user_community_ids)
        )

        if ids_param:
            try:
                id_list = [int(x.strip()) for x in ids_param.split(",") if x.strip().isdigit()]
            except Exception:
                id_list = []
            qs_filter = Q(id__in=id_list) & base_permitted
        elif community_param:
            qs_filter = Q(community_id=community_param) & base_permitted
        elif scope_param == "GLOBAL":
            qs_filter = Q(visibility="GLOBAL")
        elif scope_param == "COLLEGE":
            qs_filter = college_q
        elif scope_param in ["FOLLOWERS", "FOLLOWING"]:
            qs_filter = Q(visibility="FOLLOWERS", author_id__in=followed_ids) | Q(visibility="FOLLOWERS", author=user)
        elif scope_param == "CONNECTIONS":
            conn_u1 = list(Connection.objects.filter(user2=user, status="ACCEPTED").values_list("user1_id", flat=True))
            conn_u2 = list(Connection.objects.filter(user1=user, status="ACCEPTED").values_list("user2_id", flat=True))
            connected_ids = list(set(conn_u1) | set(conn_u2))
            qs_filter = Q(visibility="CONNECTIONS", author_id__in=connected_ids) | Q(visibility="CONNECTIONS", author=user)
        elif scope_param == "MEDIA":
            media_q = Q(media_type__in=["IMAGE", "VIDEO"]) | Q(images__isnull=False) | Q(attachments__file_type="IMAGE")
            qs_filter = base_permitted & media_q
        elif scope_param == "RESOURCES":
            resource_q = Q(media_type="DOCUMENT") | Q(document__isnull=False) | Q(attachments__file_type="DOCUMENT")
            qs_filter = base_permitted & resource_q
        elif scope_param == "COMMUNITY":
            qs_filter = Q(visibility="COMMUNITY", community_id__in=user_community_ids)
        else:
            # Default: Unified Global Timeline mixing all colleges + enrolled communities + followed peers
            qs_filter = base_permitted

        qs = (
            Post.objects.filter(
                qs_filter,
                is_deleted=False
            )
            .select_related("author", "author__profile", "author__profile__college", "community")
            .prefetch_related("images", "attachments")
            .order_by("-created_at")
        )

        if all_blocked_ids:
            qs = qs.exclude(author_id__in=all_blocked_ids)

        # Private account safeguard: exclude private posts unless viewer is the author or followed
        private_filter = Q(author__profile__is_private_account=True) & ~Q(author=user)
        if followed_ids:
            private_filter &= ~Q(author_id__in=followed_ids)
        qs = qs.exclude(private_filter)

        return annotate_post_metrics(qs, user=user)


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
            .prefetch_related("images", "attachments")
            .order_by("-created_at")
        )
        return annotate_post_metrics(qs, user=self.request.user)


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
        if visibility not in ["GLOBAL", "COLLEGE", "FOLLOWERS", "CONNECTIONS", "COMMUNITY", "ONLY_ME"]:
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


class PostDetailView(APIView):
    """
    GET /api/posts/<pk>/
    Shareable post permalink endpoint with strict server-side authorization check.
    - If post does not exist or is deleted: 404
    - If author is blocked: 403 Forbidden with safe card
    - If post is private or audience is restricted (FOLLOWERS, CONNECTIONS, PRIVATE ACCOUNT, COMMUNITY, ONLY_ME)
      and viewer is not authorized:
      Returns 403 Forbidden with safe locked card placeholder:
      {
        "detail": "This post is private or unavailable.",
        "is_private": true,
        "post_id": post.id,
        "visibility": post.visibility,
        "author": { ... }
      }
    - If authorized: returns full PostSerializer representation.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        base_qs = (
            Post.objects.filter(id=pk, is_deleted=False)
            .select_related("author", "author__profile", "author__profile__college", "community")
            .prefetch_related("images", "attachments")
        )
        post = get_object_or_404(annotate_post_metrics(base_qs, user=request.user))
        user = request.user
        is_author = (post.author_id == user.id)

        # 1. Blocking check
        if not is_author and UserBlock.is_blocked(user, post.author):
            return Response({
                "detail": "This post is unavailable.",
                "is_private": True,
                "author": None
            }, status=status.HTTP_403_FORBIDDEN)

        # 2. Author profile privacy check
        author_prof = getattr(post.author, "profile", None)
        is_author_private = getattr(author_prof, "is_private_account", False)
        is_following = Follow.is_following(user, post.author)
        is_connected = Connection.are_connected(user, post.author)

        # Private account check: if private and not author and not approved follower -> block
        if is_author_private and not is_author and not is_following:
            return self._safe_unauthorized_response(request, post, "This account is private. Follow to view posts.")

        # 3. Post visibility check
        vis = post.visibility
        if vis == "ONLY_ME" and not is_author:
            return self._safe_unauthorized_response(request, post, "This post is visible to the author only.")
        elif vis == "FOLLOWERS" and not is_author and not is_following:
            return self._safe_unauthorized_response(request, post, "This post is visible to followers only. Follow this student to view.")
        elif vis == "CONNECTIONS" and not is_author and not is_connected:
            return self._safe_unauthorized_response(request, post, "This post is visible to connections only. Connect with this student to view.")
        elif vis == "COLLEGE" and not is_author:
            user_college = getattr(getattr(user, "profile", None), "college_id", None)
            author_college = getattr(author_prof, "college_id", None)
            if user_college and author_college and user_college != author_college:
                return self._safe_unauthorized_response(request, post, "This post is restricted to members of the author's college.")
        elif vis == "COMMUNITY" and not is_author:
            if post.community_id:
                is_comm_member = CommunityMember.objects.filter(community_id=post.community_id, user=user).exists()
                if not is_comm_member:
                    return self._safe_unauthorized_response(request, post, "This post belongs to a community you haven't joined yet.")

        # Authorized: return full post serializer!
        post.likes_count = post.likes.count()
        post.comments_count = post.comments.count()
        post.user_has_liked = PostLike.objects.filter(post=post, user=user).exists()
        serializer = PostSerializer(post, context={"request": request})
        return Response(serializer.data)

    def _safe_unauthorized_response(self, request, post, reason_message):
        prof = getattr(post.author, "profile", None)
        return Response({
            "detail": reason_message,
            "is_private": True,
            "post_id": post.id,
            "visibility": post.visibility,
            "author": {
                "id": post.author.id,
                "full_name": post.author.full_name or (prof.username if prof else post.author.email.split("@")[0]),
                "username": prof.username if prof else "",
                "avatar": prof.profile_picture.url if (prof and prof.profile_picture) else None,
                "college_name": prof.college.name if (prof and prof.college) else "",
                "branch_name": prof.branch.name if (prof and prof.branch) else "",
                "is_verified": getattr(post.author, "is_verified_student", False),
                "is_private_account": getattr(prof, "is_private_account", False),
                "connection_status": Connection.get_status(request.user, post.author),
                "follow_status": Follow.get_status(request.user, post.author),
            }
        }, status=status.HTTP_403_FORBIDDEN)


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


class UserPostsView(generics.ListAPIView):
    """
    GET /api/posts/user/<int:user_id>/
    Fetches posts authored by a specific user with full privacy checks:
    - If user_id == request.user.id: returns all own posts (including ONLY_ME).
    - If user_id != request.user.id:
        - Excludes if blocked.
        - If target has a private account, requires approved follower status.
        - Excludes ONLY_ME.
        - If viewer is an approved follower: allows FOLLOWERS, GLOBAL, COLLEGE (if same college).
        - If viewer is not a follower: allows only GLOBAL and COLLEGE (if same college).
    """
    permission_classes = [IsAuthenticated]
    serializer_class = PostSerializer
    pagination_class = FeedPagination

    def get_queryset(self):
        target_user_id = self.kwargs.get("user_id")
        target_user = get_object_or_404(User, id=target_user_id)
        viewer = self.request.user
        is_self = (viewer.id == target_user.id)

        if not is_self and UserBlock.is_blocked(viewer, target_user):
            return Post.objects.none()

        target_prof = getattr(target_user, "profile", None)
        is_private = target_prof.is_private_account if target_prof else False
        is_follower = Follow.is_following(viewer, target_user)

        if not is_self and is_private and not is_follower:
            return Post.objects.none()

        qs = Post.objects.filter(author=target_user, is_deleted=False)

        if not is_self:
            qs = qs.exclude(visibility="ONLY_ME")
            viewer_college = getattr(getattr(viewer, "profile", None), "college", None)
            target_college = getattr(target_prof, "college", None)
            same_college = (viewer_college and target_college and viewer_college.id == target_college.id)

            if not is_follower:
                qs = qs.exclude(visibility="FOLLOWERS")

            if not same_college:
                qs = qs.exclude(visibility="COLLEGE")

        qs = (
            qs.select_related("author", "author__profile", "community")
            .prefetch_related("images", "attachments")
            .order_by("-created_at")
        )
        return annotate_post_metrics(qs, user=viewer)
