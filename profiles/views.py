import base64
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.files.base import ContentFile
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.contrib.auth import get_user_model
from colleges.models import College, CollegeDomain, Course, Branch, AcademicYear, Section
from communities.models import CommunityMember
from notifications.views import create_notification
from .models import StudentProfile, Connection, Follow, UserBlock, CredibilityEndorsement
from posts.models import Post
from .serializers import StudentProfileSerializer, ConnectionSerializer, FollowSerializer
from .ocr_service import IDCardOCRService

User = get_user_model()


class CompleteProfileView(APIView):
    """
    POST /api/profile/complete/
    Finalizes student onboarding:
    - Auto-derives College from verified email domain if not specified.
    - Gracefully resolves Course, Branch, Academic Year & Section to prevent hierarchy validation mismatch.
    - Enforces uniqueness of student admission_number / roll number to prevent fake or duplicate accounts.
    - Auto-enrolls student into their 3 Core Communities (College, Course/Branch, Year/Batch).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        data = request.data.copy()
        
        # 1. Resolve College
        if not data.get("college"):
            domain_match = CollegeDomain.find_by_email(user.email)
            if domain_match:
                data["college"] = domain_match.college.id
            else:
                primary_college = College.objects.filter(is_active=True).first()
                if primary_college:
                    data["college"] = primary_college.id
                else:
                    return Response(
                        {"error": "No active college found. Please contact campus administrator."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        # 2. Resolve Course, Branch, Academic Year & Section
        course_id = data.get("course")
        course_name = data.get("course_name")
        course = None
        if course_id:
            course = Course.objects.filter(id=course_id).first()
        if not course and course_name:
            course = Course.objects.filter(college_id=data["college"], name__icontains=course_name).first() or Course.objects.filter(name__icontains=course_name).first()
        if not course:
            course = Course.objects.filter(college_id=data["college"]).first()
        if course:
            data["course"] = course.id

        if course:
            # Match Branch to Course
            branch_id = data.get("branch")
            branch_name = data.get("branch_name")
            branch = None
            if branch_id:
                branch = Branch.objects.filter(id=branch_id, course=course).first()
            if not branch and branch_name:
                branch = Branch.objects.filter(course=course, name__icontains=branch_name).first()
            if not branch:
                branch = Branch.objects.filter(course=course).first()
            if branch:
                data["branch"] = branch.id

            # Match Academic Year to Course
            year_val = data.get("academic_year")
            academic_year = AcademicYear.objects.filter(id=year_val, course=course).first()
            if not academic_year and year_val is not None:
                try:
                    yr_num = int(year_val)
                    academic_year = AcademicYear.objects.filter(course=course, year_number=yr_num).first()
                except (ValueError, TypeError):
                    pass
            if not academic_year:
                academic_year = AcademicYear.objects.filter(course=course).first()
            if academic_year:
                data["academic_year"] = academic_year.id

            # Match Section to Academic Year
            if academic_year:
                sec_val = data.get("section")
                section = Section.objects.filter(id=sec_val, academic_year=academic_year).first()
                if not section:
                    section = Section.objects.filter(academic_year=academic_year).first()
                data["section"] = section.id if section else None

        # Check existing profile
        existing_profile = getattr(user, "profile", None)
        orig_method = getattr(existing_profile, "verification_method", None)
        verification_method = data.get("verification_method") or orig_method or ("ID_CARD_OCR" if data.get("id_card_image") else "MICROSOFT_SSO")

        serializer = StudentProfileSerializer(instance=existing_profile, data=data, partial=bool(existing_profile))
        serializer.is_valid(raise_exception=True)

        user_fields_to_update = []
        full_name = data.get("full_name")
        if full_name:
            user.full_name = str(full_name).strip()
            user_fields_to_update.append("full_name")

        phone_number = data.get("phone_number")
        if phone_number:
            clean_phone = "".join(filter(str.isdigit, str(phone_number)))[-10:]
            if clean_phone and not User.objects.filter(phone_number=clean_phone).exclude(id=user.id).exists():
                user.phone_number = clean_phone
                user.is_phone_verified = True
                user_fields_to_update.extend(["phone_number", "is_phone_verified"])

        if user_fields_to_update:
            user.save(update_fields=user_fields_to_update)

        is_microsoft_verified = (verification_method == "MICROSOFT_SSO")
        profile = serializer.save(
            user=user,
            college_email=user.email,
            verified=is_microsoft_verified,
            id_card_verified=is_microsoft_verified,
            profile_completed=True,
            verification_method=verification_method,
        )

        user.refresh_from_db()

        # Retrieve the 3 mandatory communities enrolled via profile post_save signal
        enrolled_communities = [
            m.community.name for m in CommunityMember.objects.filter(user=user).select_related("community")
        ]

        return Response({
            "message": f"Welcome to Campus Connect, @{profile.username}! Your college communities have been configured.",
            "profile": StudentProfileSerializer(profile).data,
            "communities_joined": enrolled_communities,
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "phone_number": user.phone_number,
                "is_email_verified": user.is_email_verified,
                "is_phone_verified": user.is_phone_verified,
                "is_verified_student": user.is_verified_student,
                "verification_tier": user.verification_tier,
                "badge_label": user.badge_label,
                "profile_completed": user.profile_completed,
            }
        }, status=status.HTTP_200_OK if existing_profile else status.HTTP_201_CREATED)


class MyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = getattr(request.user, "profile", None)
        if not profile:
            return Response(
                {"error": "Profile not created yet. Please complete onboarding."},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = StudentProfileSerializer(profile)
        return Response(serializer.data)


class EditProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        profile = getattr(request.user, "profile", None)
        if not profile:
            return Response({"error": "Profile does not exist."}, status=status.HTTP_404_NOT_FOUND)

        serializer = StudentProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            "message": "Profile updated successfully.",
            "profile": serializer.data
        })


class ScanIDCardView(APIView):
    """
    POST /api/profile/scan-id-card/
    Uploads College Physical ID Card photo (multipart or base64).
    1. Runs native high-accuracy OCR to extract Name, Roll No, College, Course, Branch, Batch.
    2. Runs Anti-Fraud checks: checks if Roll Number or ID Card image was already used by another account.
    3. Auto-associates scanned ID card with student's profile for blind testing verification.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        image_file = request.FILES.get("id_card_image")
        image_base64 = request.data.get("image_base64")

        image_bytes = None
        file_name = f"id_card_{request.user.id}.jpg"

        if image_file:
            image_bytes = image_file.read()
            file_name = image_file.name
        elif image_base64:
            try:
                # Strip data URL prefix if present
                if "," in image_base64:
                    image_base64 = image_base64.split(",", 1)[1]
                image_bytes = base64.b64decode(image_base64)
            except Exception as e:
                return Response({"error": f"Invalid base64 image data: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response(
                {"error": "Please provide an ID card photo file ('id_card_image') or base64 data ('image_base64')."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Run OCR & Anti-Fraud Scan
        scan_result = IDCardOCRService.scan_id_card_image(image_bytes, current_user=request.user)

        # If user has profile draft or existing profile, save image and metadata
        profile = getattr(request.user, "profile", None)
        if profile and image_bytes:
            content_file = ContentFile(image_bytes, name=file_name)
            profile.id_card_image = content_file
            profile.id_card_verified = not scan_result["anti_fraud"]["is_flagged"]
            profile.id_card_ocr_data = scan_result["extracted_data"]
            profile.id_card_hash = scan_result["image_hash"]
            profile.verification_method = "ID_CARD_OCR"
            if scan_result["anti_fraud"]["is_flagged"]:
                profile.is_flagged_fake = True
                profile.flag_reason = scan_result["anti_fraud"]["flag_reason"]
            profile.save(update_fields=[
                "id_card_image",
                "id_card_verified",
                "id_card_ocr_data",
                "id_card_hash",
                "verification_method",
                "is_flagged_fake",
                "flag_reason"
            ])

        return Response(scan_result, status=status.HTTP_200_OK)


class AdminIDCardAuditListView(APIView):
    """
    GET /api/profile/admin/id-cards/
    Enables campus organizers / founders to inspect registered students:
    - View student name, phone, email, roll number
    - View uploaded ID card photo & OCR match
    - Detect duplicate cards and flag fake accounts
    Protected: Only accessible to authenticated staff/admins (or in local DEBUG mode).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"error": "Unauthorized. Admin privileges required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profiles = StudentProfile.objects.all().select_related("user", "college", "course", "branch").order_by("-created_at")
        audit_list = []
        for p in profiles:
            audit_list.append({
                "user_id": p.user.id,
                "email": p.user.email,
                "phone_number": p.user.phone_number or "N/A",
                "username": p.username,
                "admission_number": p.admission_number,
                "college_name": p.college.name if p.college else "N/A",
                "course_name": p.course.name if p.course else "N/A",
                "branch_name": p.branch.name if p.branch else "N/A",
                "id_card_image": request.build_absolute_uri(p.id_card_image.url) if p.id_card_image else None,
                "id_card_verified": p.id_card_verified,
                "verification_method": p.verification_method,
                "is_flagged_fake": p.is_flagged_fake,
                "flag_reason": p.flag_reason,
                "ocr_data": p.id_card_ocr_data,
                "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            })

        return Response({
            "total_students": len(audit_list),
            "flagged_accounts": sum(1 for item in audit_list if item["is_flagged_fake"]),
            "students": audit_list
        })


class AdminAuditActionView(APIView):
    """
    POST /api/profile/admin/audit-user/
    Action: 'APPROVE' or 'FLAG_FAKE'
    Protected: Only accessible to authenticated staff/admins (or in local DEBUG mode).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"error": "Unauthorized. Admin privileges required."},
                status=status.HTTP_403_FORBIDDEN
            )

        user_id = request.data.get("user_id")
        action = request.data.get("action")  # "APPROVE" or "FLAG_FAKE"
        reason = request.data.get("reason", "")

        if not user_id or action not in ["APPROVE", "FLAG_FAKE", "RESET"]:
            return Response({"error": "Invalid user_id or action."}, status=status.HTTP_400_BAD_REQUEST)

        profile = StudentProfile.objects.filter(user_id=user_id).first()
        if not profile:
            return Response({"error": "Student profile not found."}, status=status.HTTP_404_NOT_FOUND)

        if action == "APPROVE":
            profile.id_card_verified = True
            profile.is_flagged_fake = False
            profile.flag_reason = "Manually verified by admin"
            profile.save(update_fields=["id_card_verified", "is_flagged_fake", "flag_reason"])
            msg = f"User @{profile.username} approved as verified student."
        elif action == "FLAG_FAKE":
            profile.is_flagged_fake = True
            profile.flag_reason = reason or "Flagged as fake profile during audit"
            profile.save(update_fields=["is_flagged_fake", "flag_reason"])
            msg = f"User @{profile.username} flagged as fake profile."
        else:
            profile.is_flagged_fake = False
            profile.flag_reason = ""
            profile.save(update_fields=["is_flagged_fake", "flag_reason"])
            msg = f"Flag cleared for user @{profile.username}."

        return Response({"message": msg, "user_id": user_id, "is_flagged_fake": profile.is_flagged_fake})


class ConnectionRequestView(APIView):
    """
    POST /api/profile/connections/request/
    Sends a LinkedIn-style connection request to another student.
    Payload: {"user_id": <int>}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target_user_id = request.data.get("user_id")
        if not target_user_id:
            return Response({"error": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if int(target_user_id) == request.user.id:
            return Response({"error": "Cannot connect with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = User.objects.filter(id=target_user_id).first()
        if not target_user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if UserBlock.is_blocked(request.user, target_user):
            return Response({"error": "Cannot connect with this user."}, status=status.HTTP_403_FORBIDDEN)

        u1_id, u2_id = min(request.user.id, target_user.id), max(request.user.id, target_user.id)
        connection = Connection.objects.filter(user1_id=u1_id, user2_id=u2_id).first()

        if connection:
            if connection.status == "ACCEPTED":
                return Response({"status": "CONNECTED", "message": "You are already connected with this student."})
            if connection.status == "PENDING":
                if connection.initiated_by_id == request.user.id:
                    return Response({"status": "REQUEST_SENT", "message": "Connection request already sent."})
                else:
                    # Target had sent a request to current user, auto-accept it!
                    connection.status = "ACCEPTED"
                    connection.save(update_fields=["status", "updated_at"])
                    create_notification(
                        recipient=target_user,
                        sender=request.user,
                        notification_type="CONNECTION_ACCEPTED",
                        title="Connection Accepted 🤝",
                        message=f"{request.user.full_name or request.user.email.split('@')[0]} accepted your connection request.",
                        data={"user_id": request.user.id}
                    )
                    return Response({"status": "CONNECTED", "message": "Mutual connection established!"})
            if connection.status == "BLOCKED":
                return Response({"error": "Cannot connect with this user."}, status=status.HTTP_403_FORBIDDEN)
            # Was DECLINED
            connection.status = "PENDING"
            connection.initiated_by = request.user
            connection.save(update_fields=["status", "initiated_by", "updated_at"])
        else:
            connection = Connection.objects.create(
                user1_id=u1_id,
                user2_id=u2_id,
                initiated_by=request.user,
                status="PENDING"
            )

        # Notify recipient
        sender_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else request.user.email.split('@')[0])
        create_notification(
            recipient=target_user,
            sender=request.user,
            notification_type="CONNECTION_REQUEST",
            title="New Connection Request 🤝",
            message=f"{sender_name} wants to connect with you.",
            data={"user_id": request.user.id, "connection_id": connection.id}
        )

        return Response({
            "status": "REQUEST_SENT",
            "message": "Connection request sent successfully.",
            "connection_id": connection.id
        }, status=status.HTTP_201_CREATED)


class RespondConnectionView(APIView):
    """
    POST /api/profile/connections/<user_id>/respond/
    Payload: {"action": "ACCEPT" | "DECLINE" | "BLOCK"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        action = request.data.get("action", "ACCEPT").upper()
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        u1_id, u2_id = min(request.user.id, target_user.id), max(request.user.id, target_user.id)
        connection = Connection.objects.filter(user1_id=u1_id, user2_id=u2_id).first()

        if not connection:
            return Response({"error": "No connection request found."}, status=status.HTTP_404_NOT_FOUND)

        if action == "ACCEPT":
            connection.status = "ACCEPTED"
            connection.save(update_fields=["status", "updated_at"])
            # Notify requester
            sender_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else request.user.email.split('@')[0])
            create_notification(
                recipient=target_user,
                sender=request.user,
                notification_type="CONNECTION_ACCEPTED",
                title="Connection Accepted 🤝",
                message=f"{sender_name} accepted your connection request.",
                data={"user_id": request.user.id}
            )
            return Response({"status": "CONNECTED", "message": "Connection accepted."})

        elif action == "DECLINE":
            connection.status = "DECLINED"
            connection.save(update_fields=["status", "updated_at"])
            return Response({"status": "DECLINED", "message": "Connection request declined."})

        elif action == "BLOCK":
            connection.status = "BLOCKED"
            connection.save(update_fields=["status", "updated_at"])
            UserBlock.objects.get_or_create(blocker=request.user, blocked=target_user)
            return Response({"status": "BLOCKED", "message": "User blocked."})

        return Response({"error": "Invalid action. Use ACCEPT, DECLINE, or BLOCK."}, status=status.HTTP_400_BAD_REQUEST)


class RemoveConnectionView(APIView):
    """
    DELETE /api/profile/connections/<user_id>/
    Removes an existing connection or cancels a pending sent request.
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        u1_id, u2_id = min(request.user.id, target_user.id), max(request.user.id, target_user.id)
        deleted_count, _ = Connection.objects.filter(user1_id=u1_id, user2_id=u2_id).delete()
        if deleted_count == 0:
            return Response({"status": "NOT_CONNECTED", "message": "No connection found."})
        return Response({"status": "NOT_CONNECTED", "message": "Connection removed."})


class ListConnectionsView(APIView):
    """
    GET /api/profile/connections/?tab=connected|received|sent
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tab = request.query_params.get("tab", "connected").lower()
        user = request.user

        if tab == "received":
            qs = Connection.objects.filter(
                (Q(user1=user) | Q(user2=user)),
                status="PENDING"
            ).exclude(initiated_by=user).select_related("user1", "user2", "user1__profile", "user2__profile")
        elif tab == "sent":
            qs = Connection.objects.filter(
                initiated_by=user,
                status="PENDING"
            ).select_related("user1", "user2", "user1__profile", "user2__profile")
        else:  # "connected"
            qs = Connection.objects.filter(
                (Q(user1=user) | Q(user2=user)),
                status="ACCEPTED"
            ).select_related("user1", "user2", "user1__profile", "user2__profile")

        serializer = ConnectionSerializer(qs, many=True, context={"request": request})
        return Response({
            "tab": tab,
            "count": qs.count(),
            "results": serializer.data
        })


class FollowToggleView(APIView):
    """
    POST /api/profile/follow/<user_id>/
    Follows a user or sends a follow request if the account is private.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if int(user_id) == request.user.id:
            return Response({"error": "Cannot follow yourself."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if UserBlock.is_blocked(request.user, target_user):
            return Response({"error": "Cannot follow this user."}, status=status.HTTP_403_FORBIDDEN)

        target_profile = getattr(target_user, "profile", None)
        is_private = target_profile.is_private_account if target_profile else False

        follow_rel = Follow.objects.filter(follower=request.user, following=target_user).first()
        if follow_rel:
            if follow_rel.status == "ACCEPTED":
                return Response({"follow_status": "FOLLOWING", "message": "Already following this student."})
            if follow_rel.status == "PENDING":
                return Response({"follow_status": "REQUEST_SENT", "message": "Follow request already pending."})

        # Check privacy
        new_status = "PENDING" if is_private else "ACCEPTED"
        follow_rel = Follow.objects.create(
            follower=request.user,
            following=target_user,
            status=new_status
        )

        sender_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else request.user.email.split('@')[0])
        if is_private:
            create_notification(
                recipient=target_user,
                sender=request.user,
                notification_type="FOLLOW_REQUEST",
                title="Follow Request 🔒",
                message=f"{sender_name} requested to follow you.",
                data={"user_id": request.user.id, "follow_id": follow_rel.id}
            )
            return Response({
                "follow_status": "REQUEST_SENT",
                "message": "Follow request sent to private account.",
                "is_private": True
            }, status=status.HTTP_201_CREATED)
        else:
            create_notification(
                recipient=target_user,
                sender=request.user,
                notification_type="FOLLOW",
                title="New Follower 👤",
                message=f"{sender_name} started following you.",
                data={"user_id": request.user.id}
            )
            return Response({
                "follow_status": "FOLLOWING",
                "message": f"You are now following {sender_name}.",
                "is_private": False
            }, status=status.HTTP_201_CREATED)


class UnfollowView(APIView):
    """
    POST /api/profile/unfollow/<user_id>/
    Unfollows a user or cancels a pending follow request.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        Follow.objects.filter(follower=request.user, following=target_user).delete()
        return Response({"follow_status": "NOT_FOLLOWING", "message": "Unfollowed successfully."})


class RespondFollowRequestView(APIView):
    """
    POST /api/profile/follow/requests/<request_id>/respond/
    Payload: {"action": "ACCEPT" | "REJECT"}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        action = request.data.get("action", "ACCEPT").upper()
        follow_req = Follow.objects.filter(id=request_id, following=request.user, status="PENDING").first()
        if not follow_req:
            return Response({"error": "Follow request not found."}, status=status.HTTP_404_NOT_FOUND)

        if action == "ACCEPT":
            follow_req.status = "ACCEPTED"
            follow_req.save(update_fields=["status", "updated_at"])
            recipient_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else request.user.email.split('@')[0])
            create_notification(
                recipient=follow_req.follower,
                sender=request.user,
                notification_type="FOLLOW_ACCEPTED",
                title="Follow Request Accepted ✅",
                message=f"{recipient_name} accepted your follow request.",
                data={"user_id": request.user.id}
            )
            return Response({"status": "ACCEPTED", "message": "Follow request accepted."})
        elif action == "REJECT":
            follow_req.delete()
            return Response({"status": "REJECTED", "message": "Follow request rejected."})

        return Response({"error": "Invalid action. Use ACCEPT or REJECT."}, status=status.HTTP_400_BAD_REQUEST)


class ListFollowRequestsView(APIView):
    """
    GET /api/profile/follow/requests/
    Returns pending follow requests for the authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Follow.objects.filter(following=request.user, status="PENDING").select_related("follower", "follower__profile")
        serializer = FollowSerializer(qs, many=True, context={"request": request})
        return Response({
            "count": qs.count(),
            "results": serializer.data
        })


class ListFollowersView(APIView):
    """
    GET /api/profile/<user_id>/followers/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        target_user = get_object_or_404(User, id=user_id)
        if UserBlock.is_blocked(request.user, target_user):
            return Response({"error": "Content unavailable."}, status=status.HTTP_403_FORBIDDEN)

        # If private account and viewer is not following and not self, hide
        prof = getattr(target_user, "profile", None)
        if prof and prof.is_private_account and target_user.id != request.user.id:
            if not Follow.is_following(request.user, target_user):
                return Response({"error": "This account is private. Follow to view followers."}, status=status.HTTP_403_FORBIDDEN)

        qs = Follow.objects.filter(following=target_user, status="ACCEPTED").select_related("follower", "follower__profile")
        serializer = FollowSerializer(qs, many=True, context={"request": request})
        return Response({"results": serializer.data, "count": qs.count()})


class ListFollowingView(APIView):
    """
    GET /api/profile/<user_id>/following/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        target_user = get_object_or_404(User, id=user_id)
        if UserBlock.is_blocked(request.user, target_user):
            return Response({"error": "Content unavailable."}, status=status.HTTP_403_FORBIDDEN)

        prof = getattr(target_user, "profile", None)
        if prof and prof.is_private_account and target_user.id != request.user.id:
            if not Follow.is_following(request.user, target_user):
                return Response({"error": "This account is private. Follow to view following list."}, status=status.HTTP_403_FORBIDDEN)

        qs = Follow.objects.filter(follower=target_user, status="ACCEPTED").select_related("following", "following__profile")
        serializer = FollowSerializer(qs, many=True, context={"request": request})
        return Response({"results": serializer.data, "count": qs.count()})


class UserProfileDetailView(APIView):
    """
    GET /api/profile/<user_id>/
    Fetches full student profile with relationship statuses (connection_status, follow_status, is_blocked)
    and enforces privacy masking for private accounts.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        target_user = get_object_or_404(User, id=user_id)
        is_self = (request.user.id == target_user.id)

        is_blocked = UserBlock.is_blocked(request.user, target_user)
        if is_blocked and not is_self:
            return Response({
                "id": target_user.id,
                "is_blocked": True,
                "message": "User is blocked or unavailable."
            }, status=status.HTTP_200_OK)

        prof = getattr(target_user, "profile", None)
        conn_status = Connection.get_status(request.user, target_user)
        follow_status = Follow.get_status(request.user, target_user)

        is_private = prof.is_private_account if prof else False
        can_view_content = is_self or (not is_private) or (follow_status == "FOLLOWING")

        has_endorsed = CredibilityEndorsement.objects.filter(
            endorser=request.user, recipient=target_user
        ).exists() if request.user.is_authenticated else False

        credibility_count = CredibilityEndorsement.objects.filter(recipient=target_user).count()
        posts_count = Post.objects.filter(author=target_user, is_deleted=False).count()

        base_data = {
            "id": target_user.id,
            "email": target_user.email if is_self else "",
            "full_name": target_user.full_name or (prof.username if prof else ""),
            "username": prof.username if prof else "",
            "avatar": prof.profile_picture.url if (prof and prof.profile_picture) else None,
            "college_name": prof.college.name if (prof and prof.college) else "",
            "college_short_name": prof.college.short_name if (prof and prof.college) else "",
            "branch_name": prof.branch.name if (prof and prof.branch) else "",
            "course_name": prof.course.name if (prof and prof.course) else "",
            "academic_year_name": prof.academic_year.display_name if (prof and prof.academic_year) else "",
            "is_verified": getattr(target_user, "is_verified_student", False),
            "verification_tier": getattr(target_user, "verification_tier", "SEMI_VERIFIED"),
            "badge_label": getattr(target_user, "badge_label", ""),
            "is_private_account": is_private,
            "messaging_preference": prof.messaging_preference if prof else "EVERYONE",
            "connection_status": conn_status,
            "follow_status": follow_status,
            "is_blocked": False,
            "can_view_content": can_view_content,
            "followers_count": Follow.objects.filter(following=target_user, status="ACCEPTED").count(),
            "following_count": Follow.objects.filter(follower=target_user, status="ACCEPTED").count(),
            "connections_count": Connection.objects.filter(
                Q(user1=target_user) | Q(user2=target_user),
                status="ACCEPTED"
            ).count(),
            "credibility_score": credibility_count,
            "has_endorsed": has_endorsed,
            "posts_count": posts_count,
        }

        if can_view_content:
            base_data["bio"] = prof.bio if prof else ""
            base_data["admission_number"] = prof.admission_number if (prof and is_self) else ""
            show_g = getattr(prof, "show_gender", True) if prof else True
            if is_self:
                base_data["gender"] = prof.gender if prof else ""
                base_data["show_gender"] = show_g
            elif show_g:
                base_data["gender"] = prof.gender if prof else ""
                base_data["show_gender"] = True
            else:
                base_data["gender"] = ""
                base_data["show_gender"] = False
        else:
            base_data["bio"] = "This account is private."
            base_data["admission_number"] = ""
            base_data["gender"] = ""
            base_data["show_gender"] = False

        return Response(base_data)


class EndorseStudentView(APIView):
    """
    POST /api/profile/<user_id>/endorse/
    Allows a verified student to endorse another student's profile (Credibility upvote).
    Toggles endorsement:
    - If already endorsed: removes endorsement (decrementing count).
    - If not endorsed: creates endorsement (incrementing count) and notifies recipient.
    Enforces:
    - No self-endorsement.
    - Cannot endorse if blocked.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if int(user_id) == request.user.id:
            return Response({"error": "You cannot endorse your own credibility."}, status=status.HTTP_400_BAD_REQUEST)

        target_user = get_object_or_404(User, id=user_id)

        if UserBlock.is_blocked(request.user, target_user):
            return Response({"error": "Cannot endorse this user."}, status=status.HTTP_403_FORBIDDEN)

        existing = CredibilityEndorsement.objects.filter(endorser=request.user, recipient=target_user).first()
        if existing:
            existing.delete()
            new_count = CredibilityEndorsement.objects.filter(recipient=target_user).count()
            return Response({
                "endorsed": False,
                "credibility_score": new_count,
                "message": f"Removed credibility endorsement for {target_user.full_name or target_user.username}."
            }, status=status.HTTP_200_OK)

        CredibilityEndorsement.objects.create(endorser=request.user, recipient=target_user)
        new_count = CredibilityEndorsement.objects.filter(recipient=target_user).count()

        sender_name = request.user.full_name or (request.user.profile.username if hasattr(request.user, "profile") else "A student")
        create_notification(
            recipient=target_user,
            sender=request.user,
            notification_type="CREDIBILITY_ENDORSEMENT",
            title="Credibility Endorsement ⭐",
            message=f"{sender_name} endorsed your campus credibility (+1)!",
            data={"user_id": request.user.id}
        )

        return Response({
            "endorsed": True,
            "credibility_score": new_count,
            "message": f"You endorsed {target_user.full_name or target_user.username}!"
        }, status=status.HTTP_201_CREATED)


class UpdatePrivacySettingsView(APIView):
    """
    PATCH /api/profile/settings/privacy/
    Payload: {"is_private_account": bool, "messaging_preference": "EVERYONE"|"FOLLOWING"|"CONNECTIONS_ONLY"|"NOBODY"}
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        prof = getattr(request.user, "profile", None)
        if not prof:
            return Response({"error": "Profile not found."}, status=status.HTTP_404_NOT_FOUND)

        fields_to_update = []
        if "is_private_account" in request.data:
            prof.is_private_account = bool(request.data["is_private_account"])
            fields_to_update.append("is_private_account")

        if "messaging_preference" in request.data:
            pref = str(request.data["messaging_preference"]).upper()
            if pref in ["EVERYONE", "FOLLOWING", "CONNECTIONS_ONLY", "NOBODY"]:
                prof.messaging_preference = pref
                fields_to_update.append("messaging_preference")

        if fields_to_update:
            prof.save(update_fields=fields_to_update)

        return Response({
            "message": "Privacy settings updated successfully.",
            "is_private_account": prof.is_private_account,
            "messaging_preference": prof.messaging_preference
        })


class BlockUserView(APIView):
    """
    POST /api/profile/block/<user_id>/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if int(user_id) == request.user.id:
            return Response({"error": "Cannot block yourself."}, status=status.HTTP_400_BAD_REQUEST)
        target = get_object_or_404(User, id=user_id)

        UserBlock.objects.get_or_create(blocker=request.user, blocked=target)

        # Sever follow connections
        Follow.objects.filter(
            Q(follower=request.user, following=target) |
            Q(follower=target, following=request.user)
        ).delete()

        # Update connection to BLOCKED
        u1_id, u2_id = min(request.user.id, target.id), max(request.user.id, target.id)
        Connection.objects.filter(user1_id=u1_id, user2_id=u2_id).update(status="BLOCKED")

        return Response({"is_blocked": True, "message": "Blocked user successfully."})


class UnblockUserView(APIView):
    """
    POST /api/profile/unblock/<user_id>/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        target = get_object_or_404(User, id=user_id)
        UserBlock.objects.filter(blocker=request.user, blocked=target).delete()

        u1_id, u2_id = min(request.user.id, target.id), max(request.user.id, target.id)
        Connection.objects.filter(user1_id=u1_id, user2_id=u2_id, status="BLOCKED").update(status="DECLINED")

        return Response({"is_blocked": False, "message": "Unblocked user successfully."})

