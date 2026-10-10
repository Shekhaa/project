from rest_framework import serializers

class SendOTPSerializer(serializers.Serializer):
    destination = serializers.CharField(required=True)
    purpose = serializers.ChoiceField(
        choices=["EMAIL_LOGIN", "PHONE_VERIFY", "PASSWORD_RESET", "DEVICE_CHANGE"],
        default="EMAIL_LOGIN"
    )

class VerifyOTPSerializer(serializers.Serializer):
    destination = serializers.CharField(required=True)
    otp = serializers.CharField(max_length=6, min_length=4, required=True)
    purpose = serializers.ChoiceField(
        choices=["EMAIL_LOGIN", "PHONE_VERIFY", "PASSWORD_RESET", "DEVICE_CHANGE"],
        default="EMAIL_LOGIN"
    )
