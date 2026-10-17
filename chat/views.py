from datetime import timedelta
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from accounts.models import User
from .models import Conversation, ConversationMember, Message
from .serializers import ConversationSerializer, MessageSerializer, CreateEphemeralGroupSerializer

class InboxView(generics.ListAPIView):
    """
    GET /api/chat/inbox/
    Returns list of active direct and group conversations for the authenticated user.
    Automatically excludes expired ephemeral groups so student inboxes stay 100% clean!
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        user_conv_ids = ConversationMember.objects.filter(
            user=self.request.user
        ).values_list("conversation_id", flat=True)

        include_communities = self.request.query_params.get("include_communities", "false").lower() == "true"

        qs = (
            Conversation.objects.filter(id__in=user_conv_ids)
            .exclude(is_ephemeral=True, expires_at__lt=timezone.now())
            .prefetch_related("members", "messages")
        )

        if not include_communities:
            # Keeps personal Chats tab clean: only 1-on-1 direct chats and temporary hangout groups
            qs = qs.filter(Q(is_group=False) | Q(is_ephemeral=True))

        return qs


class StartDirectChatView(APIView):
    """
    POST /api/chat/start/<identifier>/
    Starts or retrieves a 1-to-1 conversation with another student (by username or email).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, identifier):
        filters = Q(email__iexact=identifier) | Q(username__iexact=identifier)
        if hasattr(User, 'profile'):
            filters |= Q(profile__username__iexact=identifier)
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
    """
    permission_classes = [IsAuthenticated]
    serializer_class = MessageSerializer

    def get_queryset(self):
        conv_id = self.kwargs["conversation_id"]
        # Ensure user is a member
        get_object_or_404(ConversationMember, conversation_id=conv_id, user=self.request.user)

        # Mark unread incoming messages as read
        Message.objects.filter(
            conversation_id=conv_id,
            is_read=False
        ).exclude(sender=self.request.user).update(is_read=True)

        return Message.objects.filter(conversation_id=conv_id).select_related("sender", "sender__profile").order_by("created_at")


class SendMessageView(APIView):
    """
    POST /api/chat/<uuid:conversation_id>/send/
    Sends a message in the conversation.
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

        msg = Message.objects.create(
            conversation=conv,
            sender=request.user,
            text=text,
            attachment=attachment
        )
        conv.save()  # update updated_at timestamp

        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)
