from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .serializers import SendOTPSerializer, VerifyOTPSerializer
from .services import OTPService

class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        destination = serializer.validated_data["destination"]
        purpose = serializer.validated_data["purpose"]

        if "@" in destination:
            success, msg = OTPService.send_email_otp(destination, purpose)
        else:
            success, msg = OTPService.send_phone_otp(destination, purpose)

        if not success:
            return Response({"error": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({"message": msg})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        destination = serializer.validated_data["destination"]
        code = serializer.validated_data["otp"]
        purpose = serializer.validated_data["purpose"]

        is_valid, err = OTPService.verify_otp(destination, code, purpose)
        if not is_valid:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"valid": True, "message": "OTP verified successfully."})


class VerifyMagicOTPView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get("token")
        purpose = request.query_params.get("purpose", "EMAIL_LOGIN")
        if not token:
            return Response({"error": "token parameter required."}, status=status.HTTP_400_BAD_REQUEST)

        is_valid, err, destination = OTPService.verify_magic_token(token, purpose=purpose)
        if not is_valid:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "valid": True,
            "destination": destination,
            "message": "Magic verification successful."
        })

    def post(self, request):
        token = request.data.get("token")
        purpose = request.data.get("purpose", "EMAIL_LOGIN")
        if not token:
            return Response({"error": "token parameter required."}, status=status.HTTP_400_BAD_REQUEST)

        is_valid, err, destination = OTPService.verify_magic_token(token, purpose=purpose)
        if not is_valid:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "valid": True,
            "destination": destination,
            "message": "Magic verification successful."
        })
