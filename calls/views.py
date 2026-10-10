import uuid
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import models
from accounts.models import User
from .models import CallSession
from .serializers import (
    CallSessionSerializer,
    InitiateCallInputSerializer,
    AnswerCallInputSerializer,
    IceCandidateInputSerializer,
)

class InitiateCallView(APIView):
    """
    POST /api/calls/initiate/
    Caller initiates an Audio or Video call session with a peer.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InitiateCallInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        receiver = None
        if data.get("receiver_id"):
            receiver = User.objects.filter(id=data["receiver_id"]).first()
        elif data.get("receiver_email"):
            receiver = User.objects.filter(email__iexact=data["receiver_email"]).first()

        if not receiver:
            return Response({"error": "Receiver not found."}, status=status.HTTP_404_NOT_FOUND)

        if receiver == request.user:
            return Response({"error": "Cannot call yourself."}, status=status.HTTP_400_BAD_REQUEST)

        room_id = f"room-{uuid.uuid4().hex[:12]}"
        session = CallSession.objects.create(
            room_id=room_id,
            caller=request.user,
            receiver=receiver,
            call_type=data.get("call_type", "VIDEO"),
            sdp_offer=data.get("sdp_offer", ""),
            status="RINGING"
        )

        return Response(CallSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class AnswerCallView(APIView):
    """
    POST /api/calls/<room_id>/answer/
    Receiver answers call with their WebRTC SDP Answer.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        session = get_object_or_404(CallSession, room_id=room_id, receiver=request.user)
        serializer = AnswerCallInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session.sdp_answer = serializer.validated_data["sdp_answer"]
        session.status = "ACCEPTED"
        session.save(update_fields=["sdp_answer", "status"])

        return Response(CallSessionSerializer(session).data)


class IceCandidateExchangeView(APIView):
    """
    POST /api/calls/<room_id>/ice-candidate/
    Exchanges ICE candidates between caller and receiver.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        session = get_object_or_404(CallSession, room_id=room_id)
        if request.user not in [session.caller, session.receiver]:
            return Response({"error": "Unauthorized participant."}, status=status.HTTP_403_FORBIDDEN)

        serializer = IceCandidateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        candidate = serializer.validated_data["candidate"]
        candidate_entry = {
            "sender_id": request.user.id,
            "candidate": candidate
        }

        session.ice_candidates.append(candidate_entry)
        session.save(update_fields=["ice_candidates"])

        return Response({"message": "ICE candidate registered."})


class CallStatusView(APIView):
    """
    GET /api/calls/<room_id>/status/
    Polls real-time signaling status, SDP exchange, and candidates.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, room_id):
        session = get_object_or_404(CallSession, room_id=room_id)
        if request.user not in [session.caller, session.receiver]:
            return Response({"error": "Unauthorized participant."}, status=status.HTTP_403_FORBIDDEN)

        return Response(CallSessionSerializer(session).data)


class EndCallView(APIView):
    """
    POST /api/calls/<room_id>/end/
    Terminates the call session.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, room_id):
        session = get_object_or_404(CallSession, room_id=room_id)
        if request.user not in [session.caller, session.receiver]:
            return Response({"error": "Unauthorized participant."}, status=status.HTTP_403_FORBIDDEN)

        session.end_call()
        return Response({"message": "Call session ended.", "room_id": room_id})


class ActiveCallsListView(APIView):
    """
    GET /api/calls/active/
    Lists current ringing or ongoing calls for authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        active = CallSession.objects.filter(
            status__in=["RINGING", "ACCEPTED"]
        ).filter(
            models.Q(caller=request.user) | models.Q(receiver=request.user)
        )
        return Response(CallSessionSerializer(active, many=True).data)
