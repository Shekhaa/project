from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import College, CollegeDomain, Course, Branch, AcademicYear, Section
from .serializers import (
    CollegeSerializer,
    CourseSerializer,
    BranchSerializer,
    AcademicYearSerializer,
    SectionSerializer,
)

class CollegeListView(generics.ListAPIView):
    queryset = College.objects.filter(is_active=True)
    serializer_class = CollegeSerializer
    permission_classes = [AllowAny]


class CourseListView(generics.ListAPIView):
    serializer_class = CourseSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        college_id = self.kwargs["college_id"]
        return Course.objects.filter(college_id=college_id)


class BranchListView(generics.ListAPIView):
    serializer_class = BranchSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        course_id = self.kwargs["course_id"]
        return Branch.objects.filter(course_id=course_id)


class AcademicYearListView(generics.ListAPIView):
    serializer_class = AcademicYearSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        course_id = self.kwargs["course_id"]
        return AcademicYear.objects.filter(course_id=course_id)


class SectionListView(generics.ListAPIView):
    serializer_class = SectionSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        year_id = self.kwargs["year_id"]
        return Section.objects.filter(academic_year_id=year_id)


class DetectCollegeDomainView(APIView):
    """
    Endpoint: POST /api/colleges/detect-domain/
    Input: { "email": "student@geu.ac.in" }
    Output: Detected College details or friendly 404 message.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response(
                {"error": "Please provide an email address."},
                status=status.HTTP_400_BAD_REQUEST
            )

        domain_match = CollegeDomain.find_by_email(email)
        if not domain_match:
            domain = email.split("@")[-1] if "@" in email else email
            return Response(
                {
                    "detected": False,
                    "domain": domain,
                    "message": f"The domain '{domain}' is not currently registered on Campus Connect. Contact support or request your campus to be added."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = CollegeSerializer(domain_match.college)
        return Response({
            "detected": True,
            "domain": domain_match.domain,
            "college": serializer.data
        })
