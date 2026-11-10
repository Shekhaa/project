from datetime import timedelta
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from django.utils import timezone
from accounts.models import User
from attachments.services import AttachmentService
from notifications.views import create_notification
from profiles.models import Connection, Follow, UserBlock
from .models import Conversation, ConversationMember, Message, MessageRequest
from .serializers import (
    ConversationSerializer,
    MessageSerializer,
    CreateEphemeralGroupSerializer,
    ConversationMemberSerializer,
    MessageRequestSerializer,
)

class InboxView(generics.ListAPIView):
    """
    GET /api/chat/inbox/
    Returns list of active direct and group conversations for the authenticated user.
    - Excludes hidden/deleted conversations.
    - Excludes conversations pending approval in Message Requests.
    - Automatically excludes expired ephemeral groups so student inboxes stay 100% clean!
    - Excludes empty 1-on-1 chats where no message was ever exchanged (prevents search preview from clogging inbox).
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        user_memberships = ConversationMember.objects.filter(
            user=self.request.user,
            is_hidden=False
        )
        user_conv_ids = user_memberships.values_list("conversation_id", flat=True)

        include_communities = self.request.query_params.get("include_communities", "false").lower() == "true"

        # Exclude pending message requests received by this user (they belong in Message Requests tab)
        pending_received_conv_ids = MessageRequest.objects.filter(
            recipient=self.request.user,
            status="PENDING"
        ).values_list("conversation_id", flat=True)

        qs = (
            Conversation.objects.filter(id__in=user_conv_ids)
            .exclude(id__in=pending_received_conv_ids)
            .exclude(is_ephemeral=True, expires_at__lt=timezone.now())
            .prefetch_related("members", "messages")
        )

        if not include_communities:
            # Keeps personal Chats tab clean: only 1-on-1 direct chats and temporary hangout groups
            qs = qs.filter(Q(is_group=False) | Q(is_ephemeral=True))

        # Annotate message count visible to this user
        qs = qs.annotate(
            msg_count=Count(
                "messages",
                filter=~Q(messages__deleted_for_users=self.request.user) & Q(messages__is_unsent=False)
            )
        ).filter(
            Q(is_group=True) | Q(is_ephemeral=True) | Q(msg_count__gt=0)
        )

        return qs.order_by("-updated_at")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        pending_requests_count = MessageRequest.objects.filter(recipient=request.user, status="PENDING").count()
        if isinstance(response.data, dict):
            response.data["pending_requests_count"] = pending_requests_count
        elif isinstance(response.data, list):
            return Response({
                "results": response.data,
                "pending_requests_count": pending_requests_count
            })
        return response


class StartDirectChatView(APIView):
    """
    POST /api/chat/start/<identifier>/
    Starts or retrieves a 1-to-1 conversation with another student (by username or email).
    Supports safe direct messaging:
    - If blocked -> 403 Forbidden
    - If mutual connections -> instant direct chat
    - If non-connected -> checks receiver's messaging_preference:
      - NOBODY -> 403 Forbidden
      - CONNECTIONS_ONLY -> 403 Forbidden (requires connection)
      - FOLLOWING -> requires receiver to follow sender
      - EVERYONE -> creates/returns Message Request (does not clutter recipient's primary inbox)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, identifier):
        filters = Q(email__iexact=identifier) | Q(profile__username__iexact=identifier) | Q(full_name__iexact=identifier)
        if str(identifier).isdigit():
            filters |= Q(id=int(identifier))
        target_user = User.objects.filter(filters).first()

        if not target_user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_user == request.user:
            return Response({"error": "Cannot start conversation with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Safety Block Check
        if UserBlock.is_blocked(request.user, target_user):
            return Response({"error": "Cannot start conversation with this user."}, status=status.HTTP_403_FORBIDDEN)

        # 2. Check existing 1-on-1 conversation
        existing = Conversation.objects.filter(
            is_group=False,
            is_ephemeral=False,
            members__user=request.user
        ).filter(members__user=target_user).first()

        are_connected = Connection.are_connected(request.user, target_user)
        target_prof = getattr(target_user, "profile", None)
        messaging_pref = target_prof.messaging_preference if target_prof else "EVERYONE"

        # Check existing message request
        existing_request = MessageRequest.objects.filter(
            Q(sender=request.user, recipient=target_user) |
            Q(sender=target_user, recipient=request.user)
        ).first()

        # If already accepted or connected, return conversation directly
        if are_connected or (existing_request and existing_request.status == "ACCEPTED"):
            if existing:
                ConversationMember.objects.filter(
                    conversation=existing,
                    user=request.user,
                    is_hidden=True
                ).update(is_hidden=False)
                return Response(ConversationSerializer(existing, context={"request": request}).data)

            conv = Conversation.objects.create(is_group=False)
            ConversationMember.objects.create(conversation=conv, user=request.user, is_admin=True)
            ConversationMember.objects.create(conversation=conv, user=target_user)
            return Response(ConversationSerializer(conv, context={"request": request}).data, status=status.HTTP_201_CREATED)

        # Non-connected user flow: enforce recipient's messaging_preference
        if messaging_pref == "NOBODY":
            return Response(
                {"error": "This student does not accept direct messages or message requests."},
                status=status.HTTP_403_FORBIDDEN
            )
        if messaging_pref == "CONNECTIONS_ONLY":
            return Response(
                {
                    "error": "This student only accepts messages from mutual connections. Please send a connection request first.",
                    "requires_connection": True,
                    "target_user_id": target_user.id
                },
                status=status.HTTP_403_FORBIDDEN
            )
        if messaging_pref == "FOLLOWING":
            if not Follow.is_following(target_user, request.user):
                return Response(
                    {
                        "error": "This student only accepts messages from people they follow.",
                        "requires_follow": True,
                        "target_user_id": target_user.id
                    },
                    status=status.HTTP_403_FORBIDDEN
                )

        # If pending message request already exists
        if existing_request and existing_request.status == "PENDING":
            if existing_request.sender_id == request.user.id:
                return Response({
                    "status": "MESSAGE_REQUEST_PENDING",
                    "message": "Message request already sent. Waiting for recipient to accept.",
                    "message_request_id": str(existing_request.id),
                    "conversation": ConversationSerializer(existing_request.conversation, context={"request": request}).data if existing_request.conversation else None
                }, status=status.HTTP_200_OK)
            else:
                # Target had sent a message request to request.user! Auto-accept it upon initiation!
                existing_request.status = "ACCEPTED"
                existing_request.save(update_fields=["status", "updated_at"])
                if existing_request.conversation:
                    ConversationMember.objects.filter(
                        conversation=existing_request.conversation,
                        user=request.user,
                        is_hidden=True
                    ).update(is_hidden=False)
                    return Response(ConversationSerializer(existing_request.conversation, context={"request": request}).data)

        # Create new Message Request
        initial_text = request.data.get("message", "Sent you a message request.").strip() or "Sent you a message request."
        if not existing:
            existing = Conversation.objects.create(is_group=False)
            ConversationMember.objects.create(conversation=existing, user=request.user, is_admin=True)
            ConversationMember.objects.create(conversation=existing, user=target_user)

        msg_req = MessageRequest.objects.create(
            sender=request.user,
            recipient=target_user,
            initial_message=initial_text,
            conversation=existing,
            status="PENDING"
        )

        Message.objects.create(
            conversation=existing,
            sender=request.user,
            text=initial_text
        )

        sender_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else request.user.email.split('@')[0])
        create_notification(
            recipient=target_user,
            sender=request.user,
            notification_type="MESSAGE_REQUEST",
            title="Message Request ✉️",
            message=f"{sender_name} sent you a message request.",
            data={"conversation_id": str(existing.id), "message_request_id": str(msg_req.id)}
        )

        return Response({
            "status": "MESSAGE_REQUEST_SENT",
            "message": "Message request sent successfully to recipient.",
            "message_request_id": str(msg_req.id),
            "conversation": ConversationSerializer(existing, context={"request": request}).data
        }, status=status.HTTP_201_CREATED)



class CreateEphemeralGroupView(APIView):
    """
    POST /api/chat/ephemeral-group/create/
    Creates a temporary self-destructing group (10 min to 24 hrs) for hangouts, trips, or study sessions.
    Automatically cleans itself up after expiration.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateEphemeralGroupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        duration = data["duration"]
        now = timezone.now()

        if duration == "10_MIN":
            expires_at = now + timedelta(minutes=10)
        elif duration == "1_HOUR":
            expires_at = now + timedelta(hours=1)
        elif duration == "12_HOURS":
            expires_at = now + timedelta(hours=12)
        else:  # 24_HOURS
            expires_at = now + timedelta(hours=24)

        conv = Conversation.objects.create(
            name=data["name"],
            is_group=True,
            is_ephemeral=True,
            duration=duration,
            purpose_tag=data.get("purpose_tag", "Hangout"),
            expires_at=expires_at
        )
        ConversationMember.objects.create(conversation=conv, user=request.user, is_admin=True)

        return Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )


class ConversationMessagesView(generics.ListAPIView):
    """
    GET /api/chat/<uuid:conversation_id>/messages/
    Lists messages and marks unread incoming messages as read.
    Excludes messages deleted for the requesting user or unsent by sender.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def get_queryset(self):
        conv_id = self.kwargs["conversation_id"]
        # Ensure user is a member
        membership = get_object_or_404(ConversationMember, conversation_id=conv_id, user=self.request.user)

        # Mark unread incoming messages as read
        Message.objects.filter(
            conversation_id=conv_id,
            is_read=False
        ).exclude(sender=self.request.user).update(is_read=True)

        qs = Message.objects.filter(conversation_id=conv_id).exclude(
            deleted_for_users=self.request.user
        ).filter(is_unsent=False)

        # Respect user's cleared_at timestamp if they cleared past history
        if membership.cleared_at:
            qs = qs.filter(created_at__gt=membership.cleared_at)

        return qs.select_related("sender", "sender__profile").prefetch_related("attachments").order_by("created_at")


class SendMessageView(APIView):
    """
    POST /api/chat/<uuid:conversation_id>/send/
    Sends a message in the conversation with optional attachments. Unhides conversation if previously deleted.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        conv = get_object_or_404(Conversation, id=conversation_id)
        get_object_or_404(ConversationMember, conversation=conv, user=request.user)

        if conv.is_expired:
            return Response(
                {"error": "This temporary hangout group has expired and can no longer receive messages."},
                status=status.HTTP_410_GONE
            )

        text = request.data.get("text", "").strip()
        attachment = request.FILES.get("attachment")
        attachments = request.FILES.getlist("attachments") or request.FILES.getlist("files")

        if not text and not attachment and not attachments:
            return Response({"error": "Message text or attachment required."}, status=status.HTTP_400_BAD_REQUEST)

        # Check blocking for direct chats
        if not conv.is_group:
            other_user = conv.get_other_member(request.user)
            if other_user and UserBlock.is_blocked(request.user, other_user):
                return Response({"error": "Cannot send messages to this user."}, status=status.HTTP_403_FORBIDDEN)

            # Check if there is an active pending message request for this conversation
            pending_req = MessageRequest.objects.filter(conversation=conv, status="PENDING").first()
            if pending_req:
                if pending_req.sender_id == request.user.id and conv.messages.filter(sender=request.user).exists():
                    return Response({
                        "error": "You must wait for the recipient to accept your message request before sending more messages.",
                        "status": "MESSAGE_REQUEST_PENDING"
                    }, status=status.HTTP_403_FORBIDDEN)
                elif pending_req.recipient_id == request.user.id:
                    # Recipient replied! Auto-accept the message request!
                    pending_req.status = "ACCEPTED"
                    pending_req.save(update_fields=["status", "updated_at"])

        # Validate attachments upfront so oversized (>20 MB docs) or corrupt files return 400 clearly
        from django.core.exceptions import ValidationError as DjangoValidationError
        from attachments.services import MAX_DOC_SIZE
        for att_file in (attachments or []):
            try:
                AttachmentService.validate_and_process_file(att_file)
            except DjangoValidationError as err:
                msg_err = err.message if hasattr(err, "message") else str(err)
                return Response({"error": msg_err}, status=status.HTTP_400_BAD_REQUEST)

        if attachment and attachment.size > MAX_DOC_SIZE:
            return Response(
                {"error": f"Document '{attachment.name}' exceeds the 20 MB limit. Try uploading 2 different files."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # If conversation was hidden by any member, unhide it upon new message
        ConversationMember.objects.filter(
            conversation=conv,
            is_hidden=True
        ).update(is_hidden=False)

        att_first = attachment if (attachment and not attachments) else None
        msg = Message.objects.create(
            conversation=conv,
            sender=request.user,
            text=text,
            attachment=att_first
        )

        # Handle unified attachments (images, documents, voice notes, video)
        if attachments:
            for idx, att_file in enumerate(attachments):
                try:
                    AttachmentService.create_attachment(
                        uploaded_file=att_file,
                        user=request.user,
                        message=msg,
                        order=idx
                    )
                except DjangoValidationError as err:
                    msg.delete()
                    msg_err = err.message if hasattr(err, "message") else str(err)
                    return Response({"error": msg_err}, status=status.HTTP_400_BAD_REQUEST)

        conv.save()  # update updated_at timestamp

        # Dispatch in-app notification to all other conversation members
        sender_name = request.user.full_name or request.user.email.split("@")[0]
        other_members = conv.members.exclude(user=request.user).select_related("user")
        is_shared_card = "[CAMPUS_POST_CARD:" in text
        has_audio_att = msg.attachments.filter(file_type="AUDIO").exists()
        notif_type = 'SHARE' if is_shared_card else 'MESSAGE'
        notif_title = f"Post Shared 🔗" if is_shared_card else (f"{conv.name}" if conv.is_group else f"{sender_name} 💬")
        fallback_att_label = "Sent a voice note 🎙️" if has_audio_att else "Sent an attachment"
        notif_msg = f"{sender_name} shared a post with you." if is_shared_card else f"{sender_name}: {text[:75] or fallback_att_label}"

        for m in other_members:
            if not m.is_hidden:
                create_notification(
                    recipient=m.user,
                    sender=request.user,
                    notification_type=notif_type,
                    title=notif_title,
                    message=notif_msg,
                    data={'conversation_id': str(conv.id)}
                )

        return Response(MessageSerializer(msg, context={"request": request}).data, status=status.HTTP_201_CREATED)


class DeleteMessageForMeView(APIView):
    """
    POST /api/chat/messages/<uuid:message_id>/delete-for-me/
    Hides a specific message for the requesting user only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        msg = get_object_or_404(Message, id=message_id)
        # Verify user is a member of this conversation
        get_object_or_404(ConversationMember, conversation=msg.conversation, user=request.user)

        msg.deleted_for_users.add(request.user)
        return Response({
            "message": "Message deleted for you.",
            "id": str(msg.id),
        }, status=status.HTTP_200_OK)


class UnsendMessageView(APIView):
    """
    POST / DELETE /api/chat/messages/<uuid:message_id>/unsend/
    Permanently unsends (deletes for everyone) a message. Only sender or admin can unsend.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        return self._unsend(request, message_id)

    def delete(self, request, message_id):
        return self._unsend(request, message_id)

    def _unsend(self, request, message_id):
        msg = get_object_or_404(Message, id=message_id)
        # Check permissions: only sender or conversation admin
        if msg.sender != request.user:
            is_admin = ConversationMember.objects.filter(
                conversation=msg.conversation,
                user=request.user,
                is_admin=True
            ).exists()
            if not is_admin:
                return Response(
                    {"error": "You can only unsend messages that you sent."},
                    status=status.HTTP_403_FORBIDDEN
                )

        msg_id_str = str(msg.id)
        msg.delete()

        return Response({
            "message": "Message unsent successfully.",
            "id": msg_id_str,
        }, status=status.HTTP_200_OK)


class DeleteConversationView(APIView):
    """
    DELETE / POST /api/chat/<uuid:conversation_id>/delete/
    Deletes the entire conversation / chat history with a person or group.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, conversation_id):
        return self._delete(request, conversation_id)

    def post(self, request, conversation_id):
        return self._delete(request, conversation_id)

    def _delete(self, request, conversation_id):
        conv = get_object_or_404(Conversation, id=conversation_id)
        membership = get_object_or_404(ConversationMember, conversation=conv, user=request.user)

        permanent = (
            request.query_params.get("permanent", "false").lower() == "true" or
            bool(request.data.get("permanent", False))
        )

        if conv.is_group:
            if membership.is_admin and (conv.is_ephemeral or permanent):
                conv.delete()
                return Response({"message": "Group conversation deleted.", "id": str(conversation_id)})
            else:
                membership.delete()
                return Response({"message": "Left group conversation.", "id": str(conversation_id)})
        else:
            # 1-on-1 direct chat
            if permanent or conv.messages.count() == 0:
                conv.delete()
                return Response({"message": "Conversation permanently deleted.", "id": str(conversation_id)})

            # Hide for current user and clear past message history
            membership.is_hidden = True
            membership.cleared_at = timezone.now()
            membership.save(update_fields=["is_hidden", "cleared_at"])

            # Add user to deleted_for_users on all current messages
            for msg in conv.messages.all():
                msg.deleted_for_users.add(request.user)

            # If all members have hidden or deleted, remove completely
            active_members = ConversationMember.objects.filter(conversation=conv, is_hidden=False).exists()
            if not active_members:
                conv.delete()

            return Response({
                "message": "Conversation deleted from your inbox.",
                "id": str(conversation_id)
            }, status=status.HTTP_200_OK)


class ClearConversationMessagesView(APIView):
    """
    POST /api/chat/<uuid:conversation_id>/clear/
    Clears all message history in a conversation for the current user.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        conv = get_object_or_404(Conversation, id=conversation_id)
        membership = get_object_or_404(ConversationMember, conversation=conv, user=request.user)

        membership.cleared_at = timezone.now()
        membership.save(update_fields=["cleared_at"])

        for msg in conv.messages.all():
            msg.deleted_for_users.add(request.user)

        return Response({
            "message": "Chat history cleared successfully.",
            "id": str(conversation_id)
        }, status=status.HTTP_200_OK)


class AddConversationMembersView(APIView):
    """
    POST /api/chat/<uuid:conversation_id>/add-members/
    Adds selected students to group conversation (Instagram style)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, conversation_id):
        conv = get_object_or_404(Conversation, id=conversation_id)
        if not conv.is_group:
            return Response({"error": "Cannot add multiple members to a direct 1-on-1 message."}, status=status.HTTP_400_BAD_REQUEST)

        is_member = ConversationMember.objects.filter(conversation=conv, user=request.user).exists()
        if not is_member and not request.user.is_staff:
            return Response({"error": "You must be a member of this group to add people."}, status=status.HTTP_403_FORBIDDEN)

        user_ids = request.data.get("user_ids", [])
        if not user_ids and request.data.get("user_id"):
            user_ids = [request.data.get("user_id")]

        if not user_ids:
            return Response({"error": "No students selected to add."}, status=status.HTTP_400_BAD_REQUEST)

        added_users = []
        for uid in user_ids:
            try:
                u = User.objects.get(id=uid)
                member, created = ConversationMember.objects.get_or_create(
                    conversation=conv,
                    user=u,
                    defaults={"is_admin": False}
                )
                if created:
                    added_users.append(u)
                    create_notification(
                        recipient=u,
                        sender=request.user,
                        notification_type="MESSAGE",
                        title="Added to Group Chat",
                        message=f"{request.user.full_name} added you to '{conv.name or 'Campus Group'}'",
                        data={"conversation_id": str(conv.id)}
                    )
            except User.DoesNotExist:
                continue

        if added_users:
            names = ", ".join([u.full_name or u.email.split("@")[0] for u in added_users])
            Message.objects.create(
                conversation=conv,
                sender=request.user,
                text=f"👋 {request.user.full_name} added {names} to the group."
            )

        return Response({
            "added_count": len(added_users),
            "members": ConversationMemberSerializer(conv.members.all(), many=True).data
        }, status=status.HTTP_201_CREATED)


class ConversationInviteLinkView(APIView):
    """
    GET /api/chat/<uuid:conversation_id>/invite-link/
    POST /api/chat/<uuid:conversation_id>/invite-link/ (action='reset')
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        conv = get_object_or_404(Conversation, id=conversation_id)
        if not conv.is_group:
            return Response({"error": "Invite links are only available for group chats."}, status=status.HTTP_400_BAD_REQUEST)

        is_member = ConversationMember.objects.filter(conversation=conv, user=request.user).exists()
        if not is_member and not request.user.is_staff:
            return Response({"error": "You must be a member of this chat to view invite link."}, status=status.HTTP_403_FORBIDDEN)

        code = conv.get_or_create_invite_code()
        invite_url = f"https://campusconnect.edu/invite/g/{code}"
        return Response({
            "invite_code": code,
            "invite_url": invite_url,
            "group_name": conv.name or "Campus Group",
            "conversation_id": str(conv.id)
        })

    def post(self, request, conversation_id):
        conv = get_object_or_404(Conversation, id=conversation_id)
        if not conv.is_group:
            return Response({"error": "Invite links are only available for group chats."}, status=status.HTTP_400_BAD_REQUEST)

        membership = ConversationMember.objects.filter(conversation=conv, user=request.user).first()
        if not membership or (not membership.is_admin and not request.user.is_staff):
            return Response({"error": "Only group admins can reset group invite links."}, status=status.HTTP_403_FORBIDDEN)

        code = conv.reset_invite_code()
        invite_url = f"https://campusconnect.edu/invite/g/{code}"
        return Response({
            "invite_code": code,
            "invite_url": invite_url,
            "group_name": conv.name or "Campus Group",
            "conversation_id": str(conv.id),
            "message": "Group invite link has been reset successfully."
        })


class JoinByConversationInviteView(APIView):
    """
    GET /api/chat/invite/<str:invite_code>/ (Preview group chat)
    POST /api/chat/invite/<str:invite_code>/ (Join group chat)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, invite_code):
        conv = get_object_or_404(Conversation, invite_code=invite_code)
        if conv.is_ephemeral and conv.is_expired:
            return Response({"error": "This ephemeral group has expired."}, status=status.HTTP_410_GONE)

        is_member = ConversationMember.objects.filter(conversation=conv, user=request.user).exists()
        return Response({
            "id": str(conv.id),
            "name": conv.name or "Campus Group",
            "is_group": conv.is_group,
            "is_ephemeral": conv.is_ephemeral,
            "duration": conv.duration,
            "purpose_tag": conv.purpose_tag,
            "members_count": conv.members.count(),
            "is_already_member": is_member
        })

    def post(self, request, invite_code):
        conv = get_object_or_404(Conversation, invite_code=invite_code)
        if conv.is_ephemeral and conv.is_expired:
            return Response({"error": "This ephemeral group has expired."}, status=status.HTTP_410_GONE)

        member, created = ConversationMember.objects.get_or_create(
            conversation=conv,
            user=request.user,
            defaults={"is_admin": False}
        )
        if created:
            Message.objects.create(
                conversation=conv,
                sender=request.user,
                text=f"👋 {request.user.full_name} joined the group via invite link."
            )
        return Response({
            "status": "joined" if created else "already_member",
            "conversation": ConversationSerializer(conv, context={"request": request}).data
        }, status=status.HTTP_200_OK)


class MessageRequestsListView(APIView):
    """
    GET /api/chat/message-requests/
    Returns list of pending message requests received by the authenticated student.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = MessageRequest.objects.filter(
            recipient=request.user,
            status="PENDING"
        ).select_related("sender", "sender__profile", "conversation").order_by("-created_at")

        serializer = MessageRequestSerializer(qs, many=True, context={"request": request})
        return Response({
            "count": qs.count(),
            "results": serializer.data
        })


class AcceptMessageRequestView(APIView):
    """
    POST /api/chat/message-requests/<uuid:request_id>/accept/
    Accepts a pending message request, moving conversation to the main inbox.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        msg_req = get_object_or_404(MessageRequest, id=request_id, recipient=request.user, status="PENDING")
        msg_req.status = "ACCEPTED"
        msg_req.save(update_fields=["status", "updated_at"])

        if msg_req.conversation:
            # Unhide for recipient
            ConversationMember.objects.filter(
                conversation=msg_req.conversation,
                user=request.user
            ).update(is_hidden=False)

        # Dispatch notification to sender
        recipient_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else request.user.email.split('@')[0])
        create_notification(
            recipient=msg_req.sender,
            sender=request.user,
            notification_type="MESSAGE_REQUEST_ACCEPTED",
            title="Message Request Accepted 💬",
            message=f"{recipient_name} accepted your message request.",
            data={"conversation_id": str(msg_req.conversation.id) if msg_req.conversation else None}
        )

        conv_data = ConversationSerializer(msg_req.conversation, context={"request": request}).data if msg_req.conversation else None
        return Response({
            "status": "ACCEPTED",
            "message": "Message request accepted. You can now chat directly.",
            "conversation": conv_data
        })


class DeclineMessageRequestView(APIView):
    """
    POST /api/chat/message-requests/<uuid:request_id>/decline/
    Declines a message request and hides the conversation.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        msg_req = get_object_or_404(MessageRequest, id=request_id, recipient=request.user, status="PENDING")
        msg_req.status = "DECLINED"
        msg_req.save(update_fields=["status", "updated_at"])

        if msg_req.conversation:
            ConversationMember.objects.filter(
                conversation=msg_req.conversation,
                user=request.user
            ).update(is_hidden=True)

        return Response({
            "status": "DECLINED",
            "message": "Message request declined."
        })


class BlockMessageRequestView(APIView):
    """
    POST /api/chat/message-requests/<uuid:request_id>/block/
    Blocks the sender and dismisses the message request.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        msg_req = get_object_or_404(MessageRequest, id=request_id, recipient=request.user)
        msg_req.status = "BLOCKED"
        msg_req.save(update_fields=["status", "updated_at"])

        UserBlock.objects.get_or_create(blocker=request.user, blocked=msg_req.sender)

        if msg_req.conversation:
            ConversationMember.objects.filter(
                conversation=msg_req.conversation,
                user=request.user
            ).update(is_hidden=True)

        return Response({
            "status": "BLOCKED",
            "message": "Sender has been blocked."
        })


