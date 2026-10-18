from datetime import timedelta
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from django.utils import timezone
from accounts.models import User
from .models import Conversation, ConversationMember, Message
from .serializers import ConversationSerializer, MessageSerializer, CreateEphemeralGroupSerializer

class InboxView(generics.ListAPIView):
    """
    GET /api/chat/inbox/
    Returns list of active direct and group conversations for the authenticated user.
    - Excludes hidden/deleted conversations.
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

        qs = (
            Conversation.objects.filter(id__in=user_conv_ids)
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

        return qs


class StartDirectChatView(APIView):
    """
    POST /api/chat/start/<identifier>/
    Starts or retrieves a 1-to-1 conversation with another student (by username or email).
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

        # Check existing 1-on-1 conversation
        existing = Conversation.objects.filter(
            is_group=False,
            is_ephemeral=False,
            members__user=request.user
        ).filter(members__user=target_user).first()

        if existing:
            # If current user had hidden this conversation previously, unhide it
            ConversationMember.objects.filter(
                conversation=existing,
                user=request.user,
                is_hidden=True
            ).update(is_hidden=False)
            return Response(ConversationSerializer(existing, context={"request": request}).data)

        # Create new conversation
        conv = Conversation.objects.create(is_group=False)
        ConversationMember.objects.create(conversation=conv, user=request.user, is_admin=True)
        ConversationMember.objects.create(conversation=conv, user=target_user)

        return Response(
            ConversationSerializer(conv, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )


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

        return qs.select_related("sender", "sender__profile").order_by("created_at")


class SendMessageView(APIView):
    """
    POST /api/chat/<uuid:conversation_id>/send/
    Sends a message in the conversation. Unhides conversation if previously deleted.
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

        if not text and not attachment:
            return Response({"error": "Message text or attachment required."}, status=status.HTTP_400_BAD_REQUEST)

        # If conversation was hidden by any member, unhide it upon new message
        ConversationMember.objects.filter(
            conversation=conv,
            is_hidden=True
        ).update(is_hidden=False)

        msg = Message.objects.create(
            conversation=conv,
            sender=request.user,
            text=text,
            attachment=attachment
        )
        conv.save()  # update updated_at timestamp

        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


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
