from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from accounts.permissions import IsCampusVerified
from django.shortcuts import get_object_or_404
from django.db.models import Q
from colleges.models import CollegeDomain
from chat.models import Conversation, ConversationMember, Message
from .models import LostFoundPost
from .serializers import LostFoundPostSerializer

def get_user_college(user):
    if hasattr(user, "profile") and user.profile.college:
        return user.profile.college
    domain_match = CollegeDomain.find_by_email(user.email)
    return domain_match.college if domain_match else None


class LostFoundListView(generics.ListAPIView):
    """
    GET /api/lost-found/
    Stream of active Lost & Found posts.
    Query params: ?type=LOST or ?type=FOUND or ?q=search_term
    """
    permission_classes = [AllowAny]
    serializer_class = LostFoundPostSerializer

    def get_queryset(self):
        college = None
        if self.request.user and self.request.user.is_authenticated:
            college = get_user_college(self.request.user)

        if college:
            qs = LostFoundPost.objects.filter(college=college)
        else:
            qs = LostFoundPost.objects.all()

        qs = qs.select_related("author", "author__profile", "college")

        item_type = self.request.query_params.get("type")
        if item_type in ["LOST", "FOUND"]:
            qs = qs.filter(item_type=item_type)

        search_query = self.request.query_params.get("q")
        if search_query:
            qs = qs.filter(
                Q(description__icontains=search_query) | Q(location__icontains=search_query)
            )

        return qs


class CreateLostFoundPostView(APIView):
    """
    POST /api/lost-found/create/
    Frictionless 1-step post: simple description + written location + optional photo.
    """
    permission_classes = [IsAuthenticated, IsCampusVerified]

    def post(self, request):
        college = get_user_college(request.user)
        if not college:
            return Response(
                {"error": "Please complete your college profile onboarding first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        description = request.data.get("description", "").strip()
        location = request.data.get("location", "").strip()
        item_type = request.data.get("item_type", "FOUND").upper()
        image = request.FILES.get("image")

        if not description or not location:
            return Response(
                {"error": "Please provide both a description and location."},
                status=status.HTTP_400_BAD_REQUEST
            )

        post = LostFoundPost.objects.create(
            college=college,
            author=request.user,
            item_type=item_type if item_type in ["LOST", "FOUND"] else "FOUND",
            description=description,
            location=location,
            image=image
        )

        serializer = LostFoundPostSerializer(post, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ResolveLostFoundPostView(APIView):
    """
    POST /api/lost-found/<uuid:item_id>/resolve/
    Marks the item as returned/claimed.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id):
        post = get_object_or_404(LostFoundPost, id=item_id, author=request.user)
        post.mark_resolved()
        return Response({"message": "Item marked as resolved/returned successfully."})


class DeleteLostFoundPostView(APIView):
    """
    DELETE /api/lost-found/<uuid:item_id>/
    Allows the author of the Lost & Found notice to permanently delete it.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, item_id):
        if request.user.is_staff or getattr(request.user, "is_superuser", False):
            post = get_object_or_404(LostFoundPost, id=item_id)
        else:
            post = get_object_or_404(LostFoundPost, id=item_id, author=request.user)
        post.delete()
        return Response({"message": "Lost & Found post deleted successfully."}, status=status.HTTP_200_OK)


class ContactReporterView(APIView):
    """
    POST /api/lost-found/<uuid:item_id>/contact/
    1-Click In-App Chat: Starts a chat between the student and the finder/owner with item context.
    """
    permission_classes = [IsAuthenticated, IsCampusVerified]

    def post(self, request, item_id):
        item = get_object_or_404(LostFoundPost, id=item_id)
        if item.author_id == request.user.id:
            return Response(
                {"error": "You created this notice. Other students will reach out to you directly."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get or create 1-to-1 conversation
        conversation = Conversation.objects.filter(
            is_group=False,
            members__user=request.user
        ).filter(members__user=item.author).first()

        if not conversation:
            conversation = Conversation.objects.create(is_group=False)
            ConversationMember.objects.create(conversation=conversation, user=request.user, is_admin=True)
            ConversationMember.objects.create(conversation=conversation, user=item.author)

        # Send automated reference message with postcard payload so photo and details are shared in the chat
        import json
        image_url = ""
        if item.image:
            try:
                from config.media_utils import resolve_media_url
                image_url = resolve_media_url(request, item.image)
            except Exception:
                image_url = item.image.url if hasattr(item.image, "url") else ""

        author_display = (
            item.author.get_full_name()
            if hasattr(item.author, "get_full_name") and item.author.get_full_name()
            else item.author.username
        )
        card_payload = {
            "kind": "LOST_FOUND",
            "id": str(item.id),
            "author_name": author_display,
            "content": item.description,
            "location": item.location,
            "item_type": item.item_type,
            "media_type": "IMAGE" if image_url else "NONE",
            "media_url": image_url,
        }

        intro_text = (
            f"Hi! I'm reaching out regarding your [{item.item_type}] notice: '{item.description[:60]}' at {item.location}.\n"
            f"[CAMPUS_POST_CARD:{json.dumps(card_payload)}]"
        )
        recent_msg = Message.objects.filter(
            conversation=conversation,
            sender=request.user,
            text__contains=f"[CAMPUS_POST_CARD:{json.dumps(card_payload)}]"
        ).first()
        if not recent_msg:
            Message.objects.create(
                conversation=conversation,
                sender=request.user,
                text=intro_text
            )

        return Response({
            "conversation_id": str(conversation.id),
            "recipient_email": item.author.email,
            "recipient_id": item.author.id,
            "recipient_name": author_display,
            "message": "Chat thread opened with reporter."
        }, status=status.HTTP_201_CREATED)
