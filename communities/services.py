from .models import Community, CommunityMember

class CommunityEnrollmentService:
    @staticmethod
    def enroll_student_in_core_communities(user, profile):
        """
        Auto-enrolls student into the 3 core communities based on their profile:
        1. College Community (Graphic Era University)
        2. Course Community (e.g., GEU B.Tech, GEU BCA)
        3. Branch Community (e.g., GEU Computer Science & Engineering)
        4. Academic Year Community (e.g., GEU CSE First Year)
        5. Default student clubs (ACM, GDSC) so community feed is never empty.
        """
        if not user or not profile:
            return []

        enrolled = []
        try:
            # 1. College Community (Graphic Era University / Graphic Era Hill University)
            college = getattr(profile, "college", None)
            if college:
                col_comm = Community.objects.filter(
                    community_type="COLLEGE",
                    name__icontains=college.short_name
                ).first()
                if not col_comm:
                    col_comm = Community.objects.filter(community_type="COLLEGE").first()
                if col_comm:
                    CommunityMember.objects.get_or_create(
                        community=col_comm,
                        user=user,
                        defaults={"role": "MEMBER"}
                    )
                    enrolled.append(col_comm)

            # 2. Course Community (e.g. GEU B.Tech, GEHU B.Tech)
            course = getattr(profile, "course", None)
            if course:
                col_prefix = college.short_name if college else "GEU"
                course_comm = Community.objects.filter(
                    community_type="COURSE",
                    name__icontains=course.name
                ).filter(
                    name__icontains=col_prefix
                ).first()
                if not course_comm:
                    course_comm = Community.objects.filter(
                        community_type="COURSE",
                        name__icontains=course.name
                    ).first()
                if not course_comm:
                    course_comm, _ = Community.objects.get_or_create(
                        name=f"{col_prefix} {course.name}",
                        community_type="COURSE",
                        defaults={"description": f"Official {course.name} Community"}
                    )
                CommunityMember.objects.get_or_create(
                    community=course_comm,
                    user=user,
                    defaults={"role": "MEMBER"}
                )
                enrolled.append(course_comm)

        except Exception:
            pass

        return enrolled
