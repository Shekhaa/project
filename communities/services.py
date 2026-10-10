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
            # 1. College Community
            college = getattr(profile, "college", None)
            if college:
                col_comm = Community.objects.filter(
                    community_type="COLLEGE",
                    name__icontains=college.short_name
                ).first()
                if not col_comm:
                    col_comm = Community.objects.filter(community_type="COLLEGE").first()
                if col_comm:
                    CommunityMember.objects.get_or_create(community=col_comm, user=user)
                    enrolled.append(col_comm)

            # 2. Course Community
            course = getattr(profile, "course", None)
            if course:
                course_comm = Community.objects.filter(
                    community_type="COURSE",
                    name__icontains=course.name
                ).first()
                if not course_comm:
                    course_comm, _ = Community.objects.get_or_create(
                        name=f"GEU {course.name}",
                        community_type="COURSE",
                        defaults={"description": f"Official {course.name} Community"}
                    )
                CommunityMember.objects.get_or_create(community=course_comm, user=user)
                enrolled.append(course_comm)

            # 3. Branch Community
            branch = getattr(profile, "branch", None)
            if branch:
                branch_comm = Community.objects.filter(
                    community_type="BRANCH",
                    name__icontains=branch.name
                ).first()
                if not branch_comm:
                    branch_comm, _ = Community.objects.get_or_create(
                        name=f"GEU {branch.name}",
                        community_type="BRANCH",
                        defaults={"description": f"Official {branch.name} Community"}
                    )
                CommunityMember.objects.get_or_create(community=branch_comm, user=user)
                enrolled.append(branch_comm)

            # 4. Academic Year Community
            academic_year = getattr(profile, "academic_year", None)
            if academic_year:
                year_comm = Community.objects.filter(
                    community_type="YEAR",
                    name__icontains=academic_year.display_name
                ).first()
                if not year_comm:
                    year_comm, _ = Community.objects.get_or_create(
                        name=f"GEU {branch.name if branch else (course.name if course else 'Campus')} {academic_year.display_name}",
                        community_type="YEAR",
                        defaults={"description": f"{academic_year.display_name} Batch Community"}
                    )
                CommunityMember.objects.get_or_create(community=year_comm, user=user)
                enrolled.append(year_comm)

            # 5. Default Campus Clubs
            for club_slug in ["acm-chapter", "gdsc-campus"]:
                club = Community.objects.filter(slug=club_slug).first()
                if club:
                    CommunityMember.objects.get_or_create(community=club, user=user)
                    enrolled.append(club)
        except Exception:
            pass

        return enrolled
