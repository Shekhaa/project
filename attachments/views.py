import os
from django.shortcuts import get_object_or_404
from django.http import FileResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsCampusVerified
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.exceptions import ValidationError

from .models import MediaAttachment
from .services import AttachmentService
from .serializers import MediaAttachmentSerializer
from communities.models import CommunityMember
from chat.models import ConversationMember

class AttachmentDownloadView(APIView):
    """
    GET /api/attachments/<uuid:attachment_id>/download/
    Secure authenticated file download and in-app preview endpoint.
    Supports Bearer header and ?token=<jwt> parameter for direct browser downloads.
    Allows viewing/downloading attachments for public campus posts and discussions.
    """
    permission_classes = []

    def get(self, request, attachment_id):
        attachment = get_object_or_404(MediaAttachment, id=attachment_id)

        user = request.user
        if not user or not user.is_authenticated:
            token = request.query_params.get("token")
            if token:
                try:
                    from rest_framework_simplejwt.tokens import AccessToken
                    from django.contrib.auth import get_user_model
                    validated_token = AccessToken(token)
                    user_id = validated_token.payload.get("user_id")
                    user = get_user_model().objects.filter(id=user_id).first()
                except Exception:
                    pass

        # 1. Check authorization for Community Post attachment
        if attachment.post:
            if attachment.post.visibility not in ["GLOBAL", "COLLEGE"]:
                if not user or not user.is_authenticated:
                    return Response({"error": "Authentication credentials required."}, status=status.HTTP_401_UNAUTHORIZED)
                if attachment.post.community:
                    is_member = CommunityMember.objects.filter(community=attachment.post.community, user=user).exists()
                    if not is_member and attachment.post.author_id != user.id and not getattr(user, "is_staff", False):
                        return Response(
                            {"error": "Access denied. You must be an enrolled member of this community to download attachments."},
                            status=status.HTTP_403_FORBIDDEN
                        )

        # 2. Check authorization for Chat Message attachment
        if attachment.message:
            if not user or not user.is_authenticated:
                return Response({"error": "Authentication credentials required."}, status=status.HTTP_401_UNAUTHORIZED)
            is_chat_member = ConversationMember.objects.filter(
                conversation=attachment.message.conversation,
                user=user
            ).exists()
            if not is_chat_member and not getattr(user, "is_staff", False):
                return Response(
                    {"error": "Access denied. You are not a participant in this conversation."},
                    status=status.HTTP_403_FORBIDDEN
                )

        # 3. Check authorization for Community Discussion attachment
        if attachment.discussion:
            if attachment.discussion.community.is_private:
                if not user or not user.is_authenticated:
                    return Response({"error": "Authentication credentials required."}, status=status.HTTP_401_UNAUTHORIZED)
                is_comm_member = CommunityMember.objects.filter(community=attachment.discussion.community, user=user).exists()
                if not is_comm_member and attachment.discussion.author_id != user.id and not getattr(user, "is_staff", False):
                    return Response(
                        {"error": "Access denied. You must be an enrolled member of this community to download attachments."},
                        status=status.HTTP_403_FORBIDDEN
                    )

        # 3b. Check authorization for Community Discussion Reply attachment
        if attachment.discussion_reply:
            parent_disc = attachment.discussion_reply.discussion
            if parent_disc.community.is_private:
                if not user or not user.is_authenticated:
                    return Response({"error": "Authentication credentials required."}, status=status.HTTP_401_UNAUTHORIZED)
                is_comm_member = CommunityMember.objects.filter(community=parent_disc.community, user=user).exists()
                if not is_comm_member and attachment.discussion_reply.author_id != user.id and not getattr(user, "is_staff", False):
                    return Response(
                        {"error": "Access denied. You must be an enrolled member of this community to download attachments."},
                        status=status.HTTP_403_FORBIDDEN
                    )

        # 4. Check authorization for standalone unlinked attachment
        if not attachment.post and not attachment.message and not attachment.discussion and not attachment.discussion_reply:
            if not user or not user.is_authenticated or (attachment.uploaded_by_id != user.id and not getattr(user, "is_staff", False)):
                return Response(
                    {"error": "Access denied. You do not have permission to access this attachment."},
                    status=status.HTTP_403_FORBIDDEN
                )

        if not attachment.file:
            raise Http404("File not found on storage server.")

        inline_preview = request.query_params.get("preview", "false").lower() == "true"
        as_attachment = not (
            inline_preview
            and (
                attachment.file_type in ["IMAGE", "AUDIO", "VIDEO"]
                or attachment.file_extension in ["pdf", "jpg", "jpeg", "png", "webp", "gif", "mp3", "wav", "m4a", "aac", "ogg", "webm", "opus", "mp4"]
            )
        )

        try:
            if os.path.exists(attachment.file.path):
                return FileResponse(
                    open(attachment.file.path, "rb"),
                    content_type=attachment.mime_type or "application/octet-stream",
                    as_attachment=as_attachment,
                    filename=attachment.file_name
                )
        except Exception:
            pass

        if hasattr(attachment.file, "url"):
            from django.shortcuts import redirect
            return redirect(attachment.file.url)

        raise Http404("File not found.")


class AttachmentUploadView(APIView):
    """
    POST /api/attachments/upload/
    Uploads a standalone attachment ahead of time and returns its metadata & ID.
    Can later be linked to a post or message.
    """
    permission_classes = [IsAuthenticated, IsCampusVerified]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"error": "No file provided in 'file' parameter."}, status=status.HTTP_400_BAD_REQUEST)

        caption = request.data.get("caption", "").strip()

        try:
            attachment = AttachmentService.create_attachment(
                uploaded_file=uploaded_file,
                user=request.user,
                caption=caption
            )
            serializer = MediaAttachmentSerializer(attachment, context={"request": request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as err:
            return Response({"error": err.message if hasattr(err, "message") else str(err)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"Failed to upload attachment: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AttachmentDeleteView(APIView):
    """
    DELETE /api/attachments/<uuid:attachment_id>/
    Allows uploader to remove an attachment.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, attachment_id):
        attachment = get_object_or_404(MediaAttachment, id=attachment_id)
        if attachment.uploaded_by != request.user and not request.user.is_staff:
            return Response({"error": "You do not have permission to delete this attachment."}, status=status.HTTP_403_FORBIDDEN)

        # Remove physical file if exists
        try:
            if attachment.file and os.path.exists(attachment.file.path):
                os.remove(attachment.file.path)
        except Exception:
            pass

        attachment.delete()
        return Response({"message": "Attachment deleted successfully."}, status=status.HTTP_200_OK)
