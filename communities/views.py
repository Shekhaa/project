from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, F
from django.utils import timezone
import re
from notifications.views import create_notification
from .models import Community, CommunityMember, Discussion, DiscussionReply, DiscussionVote, CommunityReport
from .serializers import (
    CommunitySerializer,
    CommunityMemberSerializer,
    CommunityMemberListSerializer,
    CreateCustomCommunitySerializer,
    DiscussionSerializer,
    DiscussionDetailSerializer,
    DiscussionCreateSerializer,
    DiscussionReplySerializer,
    CommunityReportSerializer,
)
from attachments.models import MediaAttachment


def get_user_community_role(community, user):
    """Helper to check member role in a community."""
    membership = CommunityMember.objects.filter(community=community, user=user).first()
    return membership.role if membership else None


class MyCommunitiesView(generics.ListAPIView):
    serializer_class = CommunityMemberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CommunityMember.objects.filter(user=self.request.user).select_related("community")


class AllCommunitiesView(generics.ListAPIView):
    serializer_class = CommunitySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        community_type = self.request.query_params.get("type")
        q = self.request.query_params.get("q")
        qs = Community.objects.all().prefetch_related("members")
        if community_type and community_type.upper() != "ALL":
            qs = qs.filter(community_type=community_type.upper())
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q))
        return qs


class CreateCustomCommunityView(APIView):
    """
    POST /api/communities/create/
    Allows any student to create their own custom campus community/club (Reddit/WhatsApp style).
    Creator is set as OWNER.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateCustomCommunitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        community = serializer.save(
            community_type="CUSTOM",
            owner=request.user,
            is_system_managed=False
        )

        # Creator automatically becomes the OWNER
        CommunityMember.objects.get_or_create(
            community=community,
            user=request.user,
            defaults={"role": "OWNER"}
        )

        return Response(
            CommunitySerializer(community, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )


class CommunityDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = CommunitySerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "slug"
    queryset = Community.objects.all()

    def delete(self, request, *args, **kwargs):
        community = self.get_object()
        # Do not allow deleting system-managed or academic hierarchy communities
        if community.is_system_managed or community.community_type in ["COLLEGE", "COURSE", "BRANCH", "YEAR", "SECTION"]:
            return Response(
                {"error": "Academic hierarchy communities are system-managed and cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST
            )

        is_owner = (
            community.owner == request.user or
            CommunityMember.objects.filter(community=community, user=request.user, role="OWNER").exists() or
            request.user.is_staff or
            request.user.is_superuser
        )
        if not is_owner:
            return Response(
                {"error": "Only community owners or administrators can delete this community."},
                status=status.HTTP_403_FORBIDDEN
            )

        community_name = community.name
        community.delete()
        return Response({"message": f"Community '{community_name}' deleted successfully."}, status=status.HTTP_200_OK)


class JoinLeaveCommunityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)

        # Do not allow leaving mandatory academic hierarchy communities
        if community.is_system_managed or community.community_type in ["COLLEGE", "COURSE", "BRANCH", "YEAR", "SECTION"]:
            return Response(
                {"error": "Academic hierarchy communities are mandatory and cannot be manually left."},
                status=status.HTTP_400_BAD_REQUEST
            )

        membership = CommunityMember.objects.filter(community=community, user=request.user)
        if membership.exists():
            # Owner cannot leave without transferring ownership
            if membership.first().role == "OWNER":
                return Response(
                    {"error": "Community owner cannot leave without deleting or transferring ownership."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            membership.delete()
            return Response({"joined": False, "message": f"Left {community.name}"})
        else:
            CommunityMember.objects.create(community=community, user=request.user, role="MEMBER")
            return Response({"joined": True, "message": f"Joined {community.name}"})


class CommunityGroupChatView(APIView):
    """
    POST /api/communities/<slug>/chat/
    Opens or retrieves the dedicated group chat conversation for this community.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        # Ensure user is an enrolled member
        if not CommunityMember.objects.filter(community=community, user=request.user).exists():
            return Response(
                {"error": "Access denied. You must be an enrolled member to access this chat."},
                status=status.HTTP_403_FORBIDDEN
            )

        from chat.models import Conversation, ConversationMember
        from chat.serializers import ConversationSerializer

        # Look for group conversation named after this community
        conv, created = Conversation.objects.get_or_create(
            name=community.name,
            is_group=True,
            is_ephemeral=False,
            defaults={"purpose_tag": community.community_type}
        )
        ConversationMember.objects.get_or_create(conversation=conv, user=request.user)

        return Response(ConversationSerializer(conv, context={"request": request}).data)


# ==========================================
# PART B: DISCUSS SYSTEM (Reddit/StackOverflow)
# ==========================================

class CommunityDiscussionsView(APIView):
    """
    GET /api/communities/<slug>/discussions/
    POST /api/communities/<slug>/discussions/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        community = get_object_or_404(Community, slug=slug)

        qs = Discussion.objects.filter(community=community).select_related(
            "author", "author__profile", "accepted_answer", "accepted_answer__author"
        ).prefetch_related("attachments", "accepted_answer__attachments", "votes", "replies")

        # Filters
        disc_type = request.query_params.get("type")
        if disc_type and disc_type.upper() != "ALL":
            qs = qs.filter(discussion_type=disc_type.upper())

        status_filter = request.query_params.get("status")
        if status_filter == "solved":
            qs = qs.filter(is_solved=True)
        elif status_filter == "unsolved":
            qs = qs.filter(is_solved=False)

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(content__icontains=q) | Q(tags__icontains=q))

        # Sorting
        sort = request.query_params.get("sort", "latest")
        if sort == "popular":
            qs = qs.annotate(num_replies=Count("replies")).order_by("-is_pinned", "-num_replies", "-created_at")
        elif sort == "upvoted":
            qs = qs.annotate(num_votes=Count("votes", filter=Q(votes__vote_type=1))).order_by("-is_pinned", "-num_votes", "-created_at")
        elif sort == "unanswered":
            qs = qs.annotate(num_replies=Count("replies")).filter(num_replies=0).order_by("-is_pinned", "-created_at")
        else: # default latest
            qs = qs.order_by("-is_pinned", "-created_at")

        serializer = DiscussionSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        # Auto-enroll user in community if not already enrolled
        if not CommunityMember.objects.filter(community=community, user=request.user).exists():
            CommunityMember.objects.get_or_create(
                community=community,
                user=request.user,
                defaults={"role": "MEMBER"}
            )

        serializer = DiscussionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_attachment_ids = serializer.validated_data.pop("attachment_ids", [])
        discussion = serializer.save(community=community, author=request.user)

        # Attach media attachments if provided (safely filter valid UUIDs)
        if raw_attachment_ids:
            import uuid
            valid_uuids = []
            for att_id in raw_attachment_ids:
                try:
                    valid_uuids.append(uuid.UUID(str(att_id)))
                except (ValueError, TypeError):
                    pass
            if valid_uuids:
                MediaAttachment.objects.filter(
                    id__in=valid_uuids,
                    uploaded_by=request.user
                ).update(discussion=discussion)

        # Parse @mentions and notify mentioned community members
        mention_tags = set(re.findall(r'@([a-zA-Z0-9_\.]+)', f"{discussion.title} {discussion.content}"))
        if mention_tags:
            from accounts.models import User
            member_user_ids = CommunityMember.objects.filter(community=community).values_list("user_id", flat=True)
            filter_q = Q()
            for tag in mention_tags:
                filter_q |= Q(email__istartswith=tag) | Q(full_name__icontains=tag)
            matched_users = User.objects.filter(
                id__in=member_user_ids
            ).filter(filter_q).exclude(id=request.user.id).distinct()[:10]

            if matched_users.exists():
                discussion.mentioned_users.set(matched_users)
                sender_name = request.user.full_name or request.user.email.split("@")[0]
                for m_user in matched_users:
                    create_notification(
                        recipient=m_user,
                        sender=request.user,
                        notification_type='TAG',
                        title=f"Mentioned in {community.name} 🏷️",
                        message=f"{sender_name} mentioned you in a discussion: '{discussion.title[:70]}'",
                        data={
                            'community_slug': community.slug,
                            'discussion_id': str(discussion.id)
                        }
                    )

        return Response(
            DiscussionSerializer(discussion, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )


class DiscussionDetailView(APIView):
    """
    GET /api/communities/<slug>/discussions/<id>/
    PATCH /api/communities/<slug>/discussions/<id>/
    DELETE /api/communities/<slug>/discussions/<id>/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, slug, pk):
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(
            Discussion.objects.select_related("author", "author__profile", "accepted_answer").prefetch_related("attachments", "replies__attachments"),
            community=community,
            id=pk
        )
        # Increment view count
        Discussion.objects.filter(pk=discussion.pk).update(views_count=F("views_count") + 1)
        discussion.refresh_from_db()

        serializer = DiscussionDetailSerializer(discussion, context={"request": request})
        return Response(serializer.data)

    def patch(self, request, slug, pk):
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)

        if discussion.author != request.user:
            return Response({"error": "You can only edit your own discussions."}, status=status.HTTP_403_FORBIDDEN)

        title = request.data.get("title")
        content = request.data.get("content")
        tags = request.data.get("tags")

        if title:
            discussion.title = title.strip()
        if content is not None:
            discussion.content = content.strip()
        if tags is not None:
            discussion.tags = tags.strip()
        discussion.save()

        return Response(DiscussionSerializer(discussion, context={"request": request}).data)

    def delete(self, request, slug, pk):
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)

        role = get_user_community_role(community, request.user)
        is_mod = role in ["OWNER", "ADMIN", "MODERATOR"]

        if discussion.author != request.user and not is_mod and not request.user.is_staff:
            return Response({"error": "Permission denied to delete discussion."}, status=status.HTTP_403_FORBIDDEN)

        discussion.delete()
        return Response({"message": "Discussion removed successfully."})


class DiscussionPinSolvedView(APIView):
    """
    POST /api/communities/<slug>/discussions/<id>/pin/
    POST /api/communities/<slug>/discussions/<id>/solve/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk, action):
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)
        role = get_user_community_role(community, request.user)
        is_mod = role in ["OWNER", "ADMIN", "MODERATOR"] or request.user.is_staff

        if action == "pin":
            if not is_mod:
                return Response({"error": "Only community admins and moderators can pin discussions."}, status=status.HTTP_403_FORBIDDEN)
            discussion.is_pinned = not discussion.is_pinned
            discussion.save(update_fields=["is_pinned"])
            return Response({"is_pinned": discussion.is_pinned, "message": "Pin status updated."})

        elif action == "solve":
            if discussion.author != request.user and not is_mod:
                return Response({"error": "Only author or moderators can mark as solved."}, status=status.HTTP_403_FORBIDDEN)
            discussion.is_solved = not discussion.is_solved
            discussion.save(update_fields=["is_solved"])
            return Response({"is_solved": discussion.is_solved, "message": "Solved status updated."})

        return Response({"error": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)


class DiscussionRepliesView(APIView):
    """
    POST /api/communities/<slug>/discussions/<id>/replies/
    Supports typed text, voice notes / attachments, or both together.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk):
        import uuid
        from attachments.services import AttachmentService

        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)

        # Auto-enroll user in community if not already enrolled
        if not CommunityMember.objects.filter(community=community, user=request.user).exists():
            CommunityMember.objects.get_or_create(
                community=community,
                user=request.user,
                defaults={"role": "MEMBER"}
            )

        content = (request.data.get("content") or "").strip()
        uploaded_files = (
            request.FILES.getlist("attachments")
            or request.FILES.getlist("files")
            or ([request.FILES.get("file")] if request.FILES.get("file") else [])
        )

        raw_attachment_ids = []
        if hasattr(request.data, "getlist"):
            raw_attachment_ids = request.data.getlist("attachment_ids")
        if not raw_attachment_ids:
            val = request.data.get("attachment_ids")
            if isinstance(val, list):
                raw_attachment_ids = val
            elif isinstance(val, str) and val.strip():
                raw_attachment_ids = [val.strip()]

        valid_uuids = []
        for att_id in raw_attachment_ids:
            try:
                valid_uuids.append(uuid.UUID(str(att_id)))
            except (ValueError, TypeError):
                pass

        if not content and not uploaded_files and not valid_uuids:
            return Response(
                {"error": "Reply text or voice note/attachment required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        parent_reply_id = request.data.get("parent_reply_id")
        parent_reply = None
        if parent_reply_id:
            parent_reply = DiscussionReply.objects.filter(discussion=discussion, id=parent_reply_id).first()

        reply = DiscussionReply.objects.create(
            discussion=discussion,
            author=request.user,
            content=content,
            parent_reply=parent_reply
        )

        # Link pre-uploaded attachments by ID
        if valid_uuids:
            MediaAttachment.objects.filter(
                id__in=valid_uuids,
                uploaded_by=request.user
            ).update(discussion_reply=reply)

        # Create direct multipart attachments (voice notes / images / documents)
        if uploaded_files:
            for idx, att_file in enumerate(uploaded_files):
                try:
                    AttachmentService.create_attachment(
                        uploaded_file=att_file,
                        user=request.user,
                        discussion_reply=reply,
                        order=idx
                    )
                except Exception:
                    pass

        # Ensure at least text or a persisted attachment exists if uploads all failed validation
        if not content and not reply.attachments.exists():
            reply.delete()
            return Response(
                {"error": "Reply could not be saved because no valid text or attachment was provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse mentions and notify community members
        sender_name = request.user.full_name or request.user.email.split("@")[0]
        notified_user_ids = {request.user.id}

        mention_tags = set(re.findall(r'@([a-zA-Z0-9_\.]+)', content)) if content else set()
        if mention_tags:
            from accounts.models import User
            member_user_ids = CommunityMember.objects.filter(community=community).values_list("user_id", flat=True)
            filter_q = Q()
            for tag in mention_tags:
                filter_q |= Q(email__istartswith=tag) | Q(full_name__icontains=tag)
            matched_users = User.objects.filter(
                id__in=member_user_ids
            ).filter(filter_q).exclude(id=request.user.id).distinct()[:10]

            if matched_users.exists():
                reply.mentioned_users.set(matched_users)
                for m_user in matched_users:
                    notified_user_ids.add(m_user.id)
                    create_notification(
                        recipient=m_user,
                        sender=request.user,
                        notification_type='TAG',
                        title=f"Mentioned in {community.name} 🏷️",
                        message=f"{sender_name} mentioned you in a reply: '{content[:70]}'",
                        data={
                            'community_slug': community.slug,
                            'discussion_id': str(discussion.id),
                            'reply_id': str(reply.id)
                        }
                    )

        has_voice_note = reply.attachments.filter(file_type="AUDIO").exists()
        reply_action_desc = "sent a voice note reply" if has_voice_note and not content else "replied"

        # Notify parent reply author (for nested replies) or discussion author
        if parent_reply and parent_reply.author and parent_reply.author.id not in notified_user_ids:
            notified_user_ids.add(parent_reply.author.id)
            create_notification(
                recipient=parent_reply.author,
                sender=request.user,
                notification_type='REPLY',
                title='New Reply to Your Answer 💬',
                message=f"{sender_name} {reply_action_desc} to your answer in '{discussion.title[:60]}'",
                data={
                    'community_slug': community.slug,
                    'discussion_id': str(discussion.id),
                    'reply_id': str(reply.id)
                }
            )
        elif not parent_reply and discussion.author and discussion.author.id not in notified_user_ids:
            notified_user_ids.add(discussion.author.id)
            create_notification(
                recipient=discussion.author,
                sender=request.user,
                notification_type='COMMENT',
                title='New Answer on Your Discussion 💬',
                message=f"{sender_name} {'answered with a voice note in' if has_voice_note and not content else 'answered your question:'} '{discussion.title[:60]}'",
                data={
                    'community_slug': community.slug,
                    'discussion_id': str(discussion.id),
                    'reply_id': str(reply.id)
                }
            )

        return Response(
            DiscussionReplySerializer(reply, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )


class DiscussionReplyDetailView(APIView):
    """
    DELETE /api/communities/<slug>/discussions/<id>/replies/<reply_id>/
    POST /api/communities/<slug>/discussions/<id>/replies/<reply_id>/accept/
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, slug, pk, reply_id):
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)
        reply = get_object_or_404(DiscussionReply, discussion=discussion, id=reply_id)

        role = get_user_community_role(community, request.user)
        is_mod = role in ["OWNER", "ADMIN", "MODERATOR"] or request.user.is_staff

        if reply.author != request.user and not is_mod:
            return Response({"error": "Permission denied to delete this reply."}, status=status.HTTP_403_FORBIDDEN)

        if discussion.accepted_answer_id == reply.id:
            discussion.accepted_answer = None
            discussion.save(update_fields=["accepted_answer"])

        reply.delete()
        return Response({"message": "Reply deleted."})

    def post(self, request, slug, pk, reply_id):
        # Mark as accepted answer
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)
        reply = get_object_or_404(DiscussionReply, discussion=discussion, id=reply_id)

        role = get_user_community_role(community, request.user)
        is_mod = role in ["OWNER", "ADMIN", "MODERATOR"] or request.user.is_staff

        if discussion.author != request.user and not is_mod:
            return Response({"error": "Only discussion author or moderators can mark accepted answers."}, status=status.HTTP_403_FORBIDDEN)

        if discussion.accepted_answer_id == reply.id:
            discussion.accepted_answer = None
            discussion.is_solved = False
        else:
            discussion.accepted_answer = reply
            discussion.is_solved = True

            # Notify reply author that their answer was verified and accepted
            if reply.author != request.user:
                sender_name = request.user.full_name or request.user.email.split("@")[0]
                create_notification(
                    recipient=reply.author,
                    sender=request.user,
                    notification_type='ACCEPTED_ANSWER',
                    title='Answer Accepted! 🎯',
                    message=f"{sender_name} verified your answer as the accepted solution in '{discussion.title[:60]}'",
                    data={
                        'community_slug': community.slug,
                        'discussion_id': str(discussion.id),
                        'reply_id': str(reply.id)
                    }
                )

        discussion.save(update_fields=["accepted_answer", "is_solved"])
        return Response({
            "accepted_answer_id": str(discussion.accepted_answer_id) if discussion.accepted_answer_id else None,
            "is_solved": discussion.is_solved
        })


class DiscussionVoteView(APIView):
    """
    POST /api/communities/<slug>/discussions/<id>/vote/
    Upvote / unvote on a discussion or a reply.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk):
        community = get_object_or_404(Community, slug=slug)
        discussion = get_object_or_404(Discussion, community=community, id=pk)

        reply_id = request.data.get("reply_id")

        if reply_id:
            reply = get_object_or_404(DiscussionReply, discussion=discussion, id=reply_id)
            existing_vote = DiscussionVote.objects.filter(user=request.user, reply=reply).first()
            if existing_vote:
                existing_vote.delete()
                voted = False
            else:
                DiscussionVote.objects.create(user=request.user, reply=reply, vote_type=1)
                voted = True
            count = reply.votes.filter(vote_type=1).count()
            return Response({"voted": voted, "upvotes_count": count})
        else:
            existing_vote = DiscussionVote.objects.filter(user=request.user, discussion=discussion).first()
            if existing_vote:
                existing_vote.delete()
                voted = False
            else:
                DiscussionVote.objects.create(user=request.user, discussion=discussion, vote_type=1)
                voted = True
            count = discussion.votes.filter(vote_type=1).count()
            return Response({"voted": voted, "upvotes_count": count})


# ==========================================
# PART C: MEMBERSHIP & ROLES MANAGEMENT
# ==========================================

class CommunityMembersView(APIView):
    """
    GET /api/communities/<slug>/members/
    POST /api/communities/<slug>/members/ (Add verified student to custom community)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        qs = CommunityMember.objects.filter(community=community).select_related("user", "user__profile")

        q = request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(user__full_name__icontains=q) |
                Q(user__email__icontains=q)
            )

        role = request.query_params.get("role")
        if role:
            qs = qs.filter(role=role.upper())

        serializer = CommunityMemberListSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        if community.is_system_managed:
            return Response({"error": "Cannot manually add members to system-managed college hierarchy."}, status=status.HTTP_400_BAD_REQUEST)

        role = get_user_community_role(community, request.user)
        if role not in ["OWNER", "ADMIN"] and not request.user.is_staff:
            return Response({"error": "Only community owners and admins can add members."}, status=status.HTTP_403_FORBIDDEN)

        from django.contrib.auth import get_user_model
        User = get_user_model()

        student_ids = request.data.get("student_ids")
        if not student_ids and request.data.get("student_id"):
            student_ids = [request.data.get("student_id")]

        if not student_ids:
            return Response({"error": "No students specified to add."}, status=status.HTTP_400_BAD_REQUEST)

        target_role = request.data.get("role", "MEMBER").upper()
        if target_role not in ["ADMIN", "MODERATOR", "MEMBER"]:
            target_role = "MEMBER"

        added_members = []
        for s_id in student_ids:
            try:
                user_to_add = User.objects.get(id=s_id)
                member, created = CommunityMember.objects.get_or_create(
                    community=community,
                    user=user_to_add,
                    defaults={"role": target_role}
                )
                if not created and member.role != target_role:
                    member.role = target_role
                    member.save(update_fields=["role"])
                added_members.append(member)
                if created:
                    create_notification(
                        recipient=user_to_add,
                        sender=request.user,
                        notification_type="MESSAGE",
                        title="Added to Community",
                        message=f"{request.user.full_name} added you to {community.name}",
                        extra_data={"community_slug": community.slug}
                    )
            except User.DoesNotExist:
                continue

        return Response({
            "added_count": len(added_members),
            "members": CommunityMemberListSerializer(added_members, many=True).data
        }, status=status.HTTP_201_CREATED)


class CommunityMemberDetailView(APIView):
    """
    PATCH /api/communities/<slug>/members/<member_id>/ (Change role)
    DELETE /api/communities/<slug>/members/<member_id>/ (Remove member)
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, slug, member_id):
        community = get_object_or_404(Community, slug=slug)
        member = get_object_or_404(CommunityMember, community=community, id=member_id)

        current_role = get_user_community_role(community, request.user)
        if current_role not in ["OWNER", "ADMIN"] and not request.user.is_staff:
            return Response({"error": "Only owners and admins can change roles."}, status=status.HTTP_403_FORBIDDEN)

        new_role = request.data.get("role", "").upper()
        if new_role not in ["ADMIN", "MODERATOR", "MEMBER"]:
            return Response({"error": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)

        if member.role == "OWNER":
            return Response({"error": "Cannot change role of community owner."}, status=status.HTTP_400_BAD_REQUEST)

        member.role = new_role
        member.save(update_fields=["role"])
        return Response(CommunityMemberListSerializer(member).data)

    def delete(self, request, slug, member_id):
        community = get_object_or_404(Community, slug=slug)
        member = get_object_or_404(CommunityMember, community=community, id=member_id)

        current_role = get_user_community_role(community, request.user)
        if current_role not in ["OWNER", "ADMIN"] and not request.user.is_staff:
            return Response({"error": "Only owners and admins can remove members."}, status=status.HTTP_403_FORBIDDEN)

        if member.role == "OWNER":
            return Response({"error": "Cannot remove the community owner."}, status=status.HTTP_400_BAD_REQUEST)

        member.delete()
        return Response({"message": "Member removed from community."})


# ==========================================
# PART D: REPORTING & MODERATION
# ==========================================

class CommunityReportsView(APIView):
    """
    POST /api/communities/<slug>/reports/ (Submit report)
    GET /api/communities/<slug>/reports/ (List reports for moderators)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)

        serializer = CommunityReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report = serializer.save(
            reporter=request.user,
            community=community,
            status="PENDING"
        )
        return Response(
            CommunityReportSerializer(report).data,
            status=status.HTTP_201_CREATED
        )

    def get(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        role = get_user_community_role(community, request.user)
        if role not in ["OWNER", "ADMIN", "MODERATOR"] and not request.user.is_staff:
            return Response({"error": "Only moderators can view reports."}, status=status.HTTP_403_FORBIDDEN)

        reports = CommunityReport.objects.filter(community=community).select_related("reporter")
        return Response(CommunityReportSerializer(reports, many=True).data)


class CommunityReportActionView(APIView):
    """
    POST /api/communities/<slug>/reports/<report_id>/action/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, report_id):
        community = get_object_or_404(Community, slug=slug)
        report = get_object_or_404(CommunityReport, community=community, id=report_id)

        role = get_user_community_role(community, request.user)
        if role not in ["OWNER", "ADMIN", "MODERATOR"] and not request.user.is_staff:
            return Response({"error": "Only moderators can act on reports."}, status=status.HTTP_403_FORBIDDEN)

        action = request.data.get("action") # dismiss, remove_content, warn
        if action == "dismiss":
            report.status = "DISMISSED"
            report.action_taken = "Report dismissed by moderator."
        elif action == "remove_content":
            report.status = "RESOLVED"
            report.action_taken = f"Content removed ({report.target_type} #{report.target_id})."
            # Remove target object if discussion or reply
            if report.target_type == "DISCUSSION":
                Discussion.objects.filter(community=community, id=report.target_id).delete()
            elif report.target_type == "REPLY":
                DiscussionReply.objects.filter(id=report.target_id, discussion__community=community).delete()
        else:
            report.status = "RESOLVED"
            report.action_taken = request.data.get("note", "Moderation action taken.")

        report.reviewed_by = request.user
        report.save()

        return Response(CommunityReportSerializer(report).data)


class CommunityInviteLinkView(APIView):
    """
    GET /api/communities/<slug>/invite-link/
    POST /api/communities/<slug>/invite-link/ (action='reset')
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        code = community.get_or_create_invite_code()
        invite_url = f"https://campusconnect.edu/invite/c/{code}"
        return Response({
            "invite_code": code,
            "invite_url": invite_url,
            "community_name": community.name,
            "community_slug": community.slug,
        })

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        role = get_user_community_role(community, request.user)
        if role not in ["OWNER", "ADMIN"] and not request.user.is_staff:
            return Response({"error": "Only community owners and admins can reset invite links."}, status=status.HTTP_403_FORBIDDEN)

        code = community.reset_invite_code()
        invite_url = f"https://campusconnect.edu/invite/c/{code}"
        return Response({
            "invite_code": code,
            "invite_url": invite_url,
            "community_name": community.name,
            "community_slug": community.slug,
            "message": "Invite link has been reset successfully."
        })


class CommunityJoinByInviteView(APIView):
    """
    GET /api/communities/invite/<invite_code>/ (Preview community)
    POST /api/communities/invite/<invite_code>/ (Join community)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, invite_code):
        community = get_object_or_404(Community, invite_code=invite_code)
        membership = CommunityMember.objects.filter(community=community, user=request.user).first()
        return Response({
            "id": community.id,
            "name": community.name,
            "slug": community.slug,
            "description": community.description,
            "community_type": community.community_type,
            "members_count": community.members.count(),
            "owner_name": getattr(community.owner, "full_name", "") if community.owner else None,
            "is_already_member": membership is not None,
            "role": membership.role if membership else None,
        })

    def post(self, request, invite_code):
        community = get_object_or_404(Community, invite_code=invite_code)
        member, created = CommunityMember.objects.get_or_create(
            community=community,
            user=request.user,
            defaults={"role": "MEMBER"}
        )
        if created and community.owner:
            create_notification(
                recipient=community.owner,
                sender=request.user,
                notification_type="MESSAGE",
                title="New Community Member",
                message=f"{request.user.full_name} joined {community.name} via invite link",
                extra_data={"community_slug": community.slug}
            )
        return Response({
            "status": "joined" if created else "already_member",
            "community": CommunitySerializer(community, context={"request": request}).data,
            "role": member.role
        }, status=status.HTTP_200_OK)

