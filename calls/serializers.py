from rest_framework import serializers
from .models import CallSession

class CallSessionSerializer(serializers.ModelSerializer):
    caller_email = serializers.CharField(source="caller.email", read_only=True)
    caller_name = serializers.CharField(source="caller.full_name", read_only=True)
    receiver_email = serializers.CharField(source="receiver.email", read_only=True)
    receiver_name = serializers.CharField(source="receiver.full_name", read_only=True)

    class Meta:
        model = CallSession
        fields = [
            "id",
            "room_id",
            "caller",
            "caller_email",
            "caller_name",
            "receiver",
            "receiver_email",
            "receiver_name",
            "call_type",
            "status",
            "sdp_offer",
            "sdp_answer",
            "ice_candidates",
            "created_at",
            "ended_at",
        ]
        read_only_fields = ["id", "room_id", "caller", "status", "created_at", "ended_at"]


class InitiateCallInputSerializer(serializers.Serializer):
    receiver_id = serializers.IntegerField(required=False)
    receiver_email = serializers.EmailField(required=False)
    call_type = serializers.ChoiceField(choices=["AUDIO", "VIDEO"], default="VIDEO")
    sdp_offer = serializers.CharField(required=False, allow_blank=True, default="")


class AnswerCallInputSerializer(serializers.Serializer):
    sdp_answer = serializers.CharField(required=True)


class IceCandidateInputSerializer(serializers.Serializer):
    candidate = serializers.JSONField(required=True)
