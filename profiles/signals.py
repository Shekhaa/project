from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import StudentProfile
from communities.models import Community, CommunityMember

@receiver(post_save, sender=StudentProfile)
def join_mandatory_college_communities(sender, instance, **kwargs):
    """
    Automatically & idempotently joins the student into EXACTLY 3 mandatory communities:
    1. College Community (e.g. Graphic Era University)
    2. Course Community (e.g. GEU B.Tech)
    3. Section Community (e.g. GEU B.Tech - Section A)
    All other communities (clubs, hostels, societies, hangouts) are student-created custom hubs.
    """
    if not instance.profile_completed:
        return

    college = instance.college
    course = instance.course
    section = instance.section
    user = instance.user

    communities_to_join = [
        # 1. Main College Hub
        (
            f"{college.name}",
            "COLLEGE",
            f"Official campus-wide community for {college.name}"
        ),
        # 2. Course Hub
        (
            f"{college.short_name} {course.name}",
            "COURSE",
            f"{course.name} students community at {college.short_name}"
        ),
    ]

    # 3. Class Section Hub
    if section:
        section_name = f"{college.short_name} {course.name} - {section.name}"
        communities_to_join.append((
            section_name,
            "SECTION",
            f"Official class section community for {section.name}"
        ))

    for name, c_type, desc in communities_to_join:
        community, _ = Community.objects.get_or_create(
            name=name,
            community_type=c_type,
            defaults={"description": desc}
        )
        CommunityMember.objects.get_or_create(
            community=community,
            user=user
        )
