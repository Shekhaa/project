from rest_framework import serializers
from .models import StudentProfile
from colleges.models import College, Course, Branch, AcademicYear, Section

class StudentProfileSerializer(serializers.ModelSerializer):
    college_name = serializers.CharField(source="college.name", read_only=True)
    college_short_name = serializers.CharField(source="college.short_name", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.display_name", read_only=True)
    section_name = serializers.CharField(source="section.name", read_only=True)
    verification_tier = serializers.CharField(source="user.verification_tier", read_only=True)
    badge_label = serializers.CharField(source="user.badge_label", read_only=True)

    class Meta:
        model = StudentProfile
        fields = [
            "id",
            "username",
            "bio",
            "profile_picture",
            "gender",
            "anonymous_enabled",
            "admission_number",
            "college",
            "college_name",
            "college_short_name",
            "course",
            "course_name",
            "branch",
            "branch_name",
            "academic_year",
            "academic_year_name",
            "section",
            "section_name",
            "id_card_image",
            "id_card_verified",
            "id_card_ocr_data",
            "verification_method",
            "verification_tier",
            "badge_label",
            "is_flagged_fake",
            "flag_reason",
            "verified",
            "profile_completed",
            "created_at",
        ]
        read_only_fields = ["id", "verified", "profile_completed", "created_at"]

    def validate(self, attrs):
        college = attrs.get("college") or (self.instance.college if self.instance else None)
        course = attrs.get("course") or (self.instance.course if self.instance else None)
        branch = attrs.get("branch") or (self.instance.branch if self.instance else None)
        academic_year = attrs.get("academic_year") or (self.instance.academic_year if self.instance else None)
        section = attrs.get("section") if "section" in attrs else (self.instance.section if self.instance else None)
        admission_number = attrs.get("admission_number")

        # Roll Number Uniqueness Check (anti-cheat / fraud prevention)
        if admission_number:
            existing = StudentProfile.objects.filter(admission_number__iexact=admission_number.strip())
            if self.instance:
                existing = existing.exclude(id=self.instance.id)
            if existing.exists():
                raise serializers.ValidationError({
                    "admission_number": f"Student Roll Number / ID '{admission_number}' is already registered to another account."
                })

        # 1. Course must belong to College
        if course and college and course.college_id != college.id:
            raise serializers.ValidationError({
                "course": f"The course '{course.name}' does not belong to {college.name}."
            })

        # 2. Branch must belong to Course
        if branch and course and branch.course_id != course.id:
            raise serializers.ValidationError({
                "branch": f"The branch '{branch.name}' does not belong to course '{course.name}'."
            })

        # 3. Academic Year must belong to Course
        if academic_year and course and academic_year.course_id != course.id:
            raise serializers.ValidationError({
                "academic_year": f"The academic year '{academic_year.display_name}' does not belong to course '{course.name}'."
            })

        # 4. Section must belong to Academic Year
        if section and academic_year and section.academic_year_id != academic_year.id:
            raise serializers.ValidationError({
                "section": f"The section '{section.name}' does not belong to academic year '{academic_year.display_name}'."
            })

        return attrs

    def update(self, instance, validated_data):
        # Lock academic identity fields once completed
        if instance.profile_completed:
            locked_fields = ["college", "course", "branch", "academic_year", "gender"]
            for field in locked_fields:
                validated_data.pop(field, None)

        return super().update(instance, validated_data)
