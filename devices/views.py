from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import DeviceSerializer, RegisterDeviceInputSerializer
from .services import DeviceService
from .models import Device, DeviceLinkChallenge

class RegisterDeviceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RegisterDeviceInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        data["ip_address"] = request.META.get("REMOTE_ADDR")

        device = DeviceService.register_or_update(request.user, data)
        return Response({
            "message": "Device successfully registered.",
            "device": DeviceSerializer(device).data
        }, status=status.HTTP_201_CREATED)


class MyDevicesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        devices = Device.objects.filter(user=request.user, is_active=True)
        serializer = DeviceSerializer(devices, many=True)
        return Response(serializer.data)


class RevokeDeviceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, device_uuid):
        device = Device.objects.filter(user=request.user, device_uuid=device_uuid).first()
        if not device:
            return Response({"error": "Device not found."}, status=status.HTTP_404_NOT_FOUND)

        device.is_active = False
        device.is_primary = False
        device.save(update_fields=["is_active", "is_primary"])
        return Response({"message": f"Device '{device.device_name}' revoked successfully."})


class CreateQRChallengeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        web_uuid = request.data.get("device_uuid", "")
        browser_info = request.data.get("browser", request.META.get("HTTP_USER_AGENT", ""))
        challenge = DeviceService.create_qr_challenge(web_uuid, browser_info)

        return Response({
            "challenge_token": challenge.challenge_token,
            "expires_at": challenge.expires_at,
            "poll_url": f"/api/devices/qr/status/{challenge.challenge_token}/"
        })


class AuthorizeQRChallengeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("challenge_token", "").strip()
        if not token:
            return Response({"error": "Challenge token required."}, status=status.HTTP_400_BAD_REQUEST)

        success, msg = DeviceService.authorize_qr_challenge(token, request.user)
        if not success:
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"message": msg})


class PollQRChallengeStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        challenge = DeviceLinkChallenge.objects.filter(challenge_token=token).first()
        if not challenge:
            return Response({"error": "Invalid challenge."}, status=status.HTTP_404_NOT_FOUND)

        if challenge.is_expired:
            return Response({"status": "EXPIRED", "message": "QR challenge expired."}, status=status.HTTP_410_GONE)

        if challenge.status == "PENDING":
            return Response({"status": "PENDING", "message": "Waiting for mobile authorization."})

        if challenge.status == "AUTHORIZED":
            user, err = DeviceService.consume_qr_challenge(token)
            if not user:
                return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

            refresh = RefreshToken.for_user(user)
            return Response({
                "status": "CONSUMED",
                "message": "Authenticated via QR code.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "is_verified_student": user.is_verified_student,
                    "profile_completed": user.profile_completed,
                }
            })

        return Response({"status": challenge.status})
