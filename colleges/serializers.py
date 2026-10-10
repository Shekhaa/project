from rest_framework import serializers
from .models import College, CollegeDomain, Course, Branch, AcademicYear, Section

class CollegeDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = CollegeDomain
        fields = ["id", "domain"]


class CollegeSerializer(serializers.ModelSerializer):
    domains = CollegeDomainSerializer(many=True, read_only=True)

    class Meta:
        model = College
        fields = ["id", "name", "short_name", "logo", "is_active", "domains", "created_at"]


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ["id", "name", "display_order", "academic_year"]


class AcademicYearSerializer(serializers.ModelSerializer):
    sections = SectionSerializer(many=True, read_only=True)

    class Meta:
        model = AcademicYear
        fields = ["id", "year_number", "display_name", "batch", "course", "sections"]


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "name", "code", "display_order", "course"]


class CourseSerializer(serializers.ModelSerializer):
    branches = BranchSerializer(many=True, read_only=True)
    academic_years = AcademicYearSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = ["id", "name", "code", "duration", "display_order", "college", "branches", "academic_years"]
