from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from .models import Community, CommunityMember
from .serializers import CommunitySerializer, CommunityMemberSerializer, CreateCustomCommunitySerializer

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
        qs = Community.objects.all()
        if community_type:
            qs = qs.filter(community_type=community_type.upper())
        return qs


class CreateCustomCommunityView(APIView):
    """
    POST /api/communities/create/
    Allows any student to create their own custom campus community/club (Reddit/WhatsApp style).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateCustomCommunitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        community = serializer.save(community_type="CUSTOM")

        # Creator automatically becomes the first member
        CommunityMember.objects.get_or_create(community=community, user=request.user)

        return Response(
            CommunitySerializer(community, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )


class CommunityDetailView(generics.RetrieveAPIView):
    serializer_class = CommunitySerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "slug"
    queryset = Community.objects.all()


class JoinLeaveCommunityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)

        # Do not allow leaving mandatory academic communities
        if community.community_type in ["COLLEGE", "COURSE", "SECTION"]:
            return Response(
                {"error": "Academic hierarchy communities are mandatory and cannot be manually left."},
                status=status.HTTP_400_BAD_REQUEST
            )

        membership = CommunityMember.objects.filter(community=community, user=request.user)
        if membership.exists():
            membership.delete()
            return Response({"joined": False, "message": f"Left {community.name}"})
        else:
            CommunityMember.objects.create(community=community, user=request.user)
            return Response({"joined": True, "message": f"Joined {community.name}"})


class CommunityGroupChatView(APIView):
    """
    POST /api/communities/<slug>/chat/
    Opens or retrieves the dedicated group chat conversation for this community.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        community = get_object_or_404(Community, slug=slug)
        # Ensure user is a member or auto-join
        CommunityMember.objects.get_or_create(community=community, user=request.user)

        from chat.models import Conversation, ConversationMember
        from chat.serializers import ConversationSerializer

        # Look for group conversation named after this community
        conv, created = Conversation.objects.get_or_create(
            name=community.name,
            is_group=True,
            is_ephemeral=False,
            defaults={"purpose_tag": community.community_type}
        )
        # Add user to conversation if not already in
        ConversationMember.objects.get_or_create(conversation=conv, user=request.user)

        return Response(ConversationSerializer(conv, context={"request": request}).data)

