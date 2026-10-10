import base64
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.core.files.base import ContentFile
from colleges.models import College, CollegeDomain, Course, Branch, AcademicYear, Section
from communities.services import CommunityEnrollmentService
from .models import StudentProfile
from .serializers import StudentProfileSerializer
from .ocr_service import IDCardOCRService


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
        course = None
        if course_id:
            course = Course.objects.filter(id=course_id).first()
        if not course:
            course = Course.objects.filter(college_id=data["college"]).first()
            if course:
                data["course"] = course.id

        if course:
            # Match Branch to Course
            branch_id = data.get("branch")
            branch = Branch.objects.filter(id=branch_id, course=course).first()
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
        profile = getattr(user, "profile", None)

        serializer = StudentProfileSerializer(instance=profile, data=data, partial=bool(profile))
        serializer.is_valid(raise_exception=True)

        verification_method = data.get("verification_method", "ID_CARD_OCR" if data.get("id_card_image") else "MANUAL")

        full_name = data.get("full_name")
        if full_name:
            user.full_name = str(full_name).strip()
            user.save(update_fields=["full_name"])

        profile = serializer.save(
            user=user,
            college_email=user.email,
            verified=True,
            profile_completed=True,
            verification_method=verification_method,
        )

        # Auto-enroll in 3 Core Communities
        enrolled_communities = CommunityEnrollmentService.enroll_student_in_core_communities(user, profile)

        return Response({
            "message": f"Welcome to Campus Connect, @{profile.username}! Your college communities have been configured.",
            "profile": StudentProfileSerializer(profile).data,
            "communities_joined": [c.name for c in enrolled_communities],
        }, status=status.HTTP_201_CREATED if not profile else status.HTTP_200_OK)


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
    Enables campus organizers / founders to inspect all 100 blind testing students:
    - View student name, phone, email, roll number
    - View uploaded ID card photo & OCR match
    - Detect duplicate cards and flag fake accounts
    """
    permission_classes = [AllowAny] # In production protect with staff/admin check

    def get(self, request):
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
    """
    permission_classes = [AllowAny]

    def post(self, request):
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
