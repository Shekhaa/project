from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
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
    Stream of active Lost & Found posts scoped exclusively to the student's college.
    Query params: ?type=LOST or ?type=FOUND or ?q=search_term
    """
    permission_classes = [IsAuthenticated]
    serializer_class = LostFoundPostSerializer

    def get_queryset(self):
        college = get_user_college(self.request.user)
        if not college:
            return LostFoundPost.objects.none()

        qs = LostFoundPost.objects.filter(college=college).select_related("author", "author__profile", "college")
        
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
    permission_classes = [IsAuthenticated]

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


class ContactReporterView(APIView):
    """
    POST /api/lost-found/<uuid:item_id>/contact/
    1-Click In-App Chat: Starts a chat between the student and the finder/owner with item context.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, item_id):
        item = get_object_or_404(LostFoundPost, id=item_id)
        if item.author == request.user:
            return Response({"error": "You created this post."}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create 1-to-1 conversation
        conversation = Conversation.objects.filter(
            is_group=False,
            members__user=request.user
        ).filter(members__user=item.author).first()

        if not conversation:
            conversation = Conversation.objects.create(is_group=False)
            ConversationMember.objects.create(conversation=conversation, user=request.user, is_admin=True)
            ConversationMember.objects.create(conversation=conversation, user=item.author)

        # Send automated reference message
        intro_text = f"Hi! I'm reaching out regarding your [{item.item_type}] post: '{item.description[:60]}' at {item.location}."
        Message.objects.create(
            conversation=conversation,
            sender=request.user,
            text=intro_text
        )

        return Response({
            "conversation_id": str(conversation.id),
            "recipient_email": item.author.email,
            "message": "Chat thread opened with reporter."
        }, status=status.HTTP_201_CREATED)
