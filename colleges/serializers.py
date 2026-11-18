from rest_framework import serializers
from .models import College, CollegeDomain, Course, Branch, AcademicYear, Section

class CollegeDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = CollegeDomain
        fields = ["id", "domain"]


class CollegeSerializer(serializers.ModelSerializer):
    domains = CollegeDomainSerializer(many=True, read_only=True)
    city = serializers.SerializerMethodField()

    class Meta:
        model = College
        fields = ["id", "name", "short_name", "city", "logo", "is_active", "domains", "created_at"]

    def get_city(self, obj):
        if getattr(obj, "city", None) and obj.city.strip():
            return obj.city.strip()
        name_l = (obj.name or "").lower()
        short_l = (obj.short_name or "").lower()
        if "rudrapur" in name_l or "rdr" in short_l or "dvp" in short_l:
            return "Rudrapur"
        if "haldwani" in name_l or "hld" in short_l:
            return "Haldwani"
        if "bhimtal" in name_l:
            return "Bhimtal"
        if "nainital" in name_l or "ntl" in short_l:
            return "Nainital"
        if "pantnagar" in name_l:
            return "Pantnagar"
        if "roorkee" in name_l or "iitr" in short_l:
            return "Roorkee"
        if "rishikesh" in name_l:
            return "Rishikesh"
        if "srinagar" in name_l:
            return "Srinagar Garhwal"
        if "dehradun" in name_l or "ddn" in short_l or "geu" in short_l or "dit" in short_l or "upes" in short_l:
            return "Dehradun"
        return "Uttarakhand"


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
