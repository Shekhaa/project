import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from colleges.models import College, Course, Branch, AcademicYear
from profiles.models import StudentProfile
from communities.models import Community, CommunityMember
from communities.services import CommunityEnrollmentService

def seed_gehu_data():
    print("--- 1. Setting up Graphic Era Hill University Communities ---")
    gehu_college = College.objects.filter(short_name="GEHU").first()
    if not gehu_college:
        print("GEHU College not found, creating...")
        gehu_college = College.objects.create(
            name="Graphic Era Hill University",
            short_name="GEHU",
            city="Dehradun",
            state="Uttarakhand",
            is_active=True
        )

    # College Community
    gehu_comm, _ = Community.objects.get_or_create(
        name="Graphic Era Hill University",
        community_type="COLLEGE",
        defaults={"description": "Official campus community for Graphic Era Hill University (GEHU)"}
    )
    print(f"Verified Community: {gehu_comm.name} ({gehu_comm.slug})")

    # Course & Branch Communities for GEHU
    gehu_btech_comm, _ = Community.objects.get_or_create(
        name="GEHU B.Tech",
        community_type="COURSE",
        defaults={"description": "B.Tech Engineering students at Graphic Era Hill University"}
    )
    gehu_cse_comm, _ = Community.objects.get_or_create(
        name="GEHU Computer Science & Engineering",
        community_type="BRANCH",
        defaults={"description": "CSE & Tech specialization students at GEHU"}
    )
    gehu_bca_comm, _ = Community.objects.get_or_create(
        name="GEHU BCA",
        community_type="COURSE",
        defaults={"description": "BCA students community at GEHU"}
    )
    gehu_mba_comm, _ = Community.objects.get_or_create(
        name="GEHU MBA",
        community_type="COURSE",
        defaults={"description": "MBA Management students community at GEHU"}
    )

    print("--- 2. Seeding 5 Production-Ready GEHU Student Accounts ---")
    STUDENTS = [
        {
            "full_name": "Aarav Joshi",
            "username": "aarav_gehu",
            "email": "aarav.joshi@gehu.ac.in",
            "phone_number": "9876510001",
            "password": "Campus@2026",
            "gender": "Male",
            "admission_number": "GEHU2024CSE01",
            "course_id": 5, # GEHU B.Tech
            "branch_id": 5, # GEHU CSE
            "academic_year_id": 13, # GEHU 2nd Year
            "bio": "GEHU B.Tech CSE • Android & Web Developer • Hackathon enthusiast 💻",
        },
        {
            "full_name": "Priya Rawat",
            "username": "priya_gehu",
            "email": "priya.rawat@gehu.ac.in",
            "phone_number": "9876510002",
            "password": "Campus@2026",
            "gender": "Female",
            "admission_number": "GEHU2024AIML02",
            "course_id": 5, # GEHU B.Tech
            "branch_id": 6, # GEHU AI/ML
            "academic_year_id": 13, # GEHU 2nd Year
            "bio": "GEHU AI & ML 2nd Year • GDSC Member • Passionate about Neural Networks 🤖",
        },
        {
            "full_name": "Rohan Bisht",
            "username": "rohan_gehu",
            "email": "rohan.bisht@gehu.ac.in",
            "phone_number": "9876510003",
            "password": "Campus@2026",
            "gender": "Male",
            "admission_number": "GEHU2024BCA03",
            "course_id": 6, # GEHU BCA
            "branch_id": 12, # GEHU BCA Core
            "academic_year_id": 16, # GEHU 1st Year
            "bio": "BCA 1st Year at Graphic Era Hill University • Frontend designer & gamer 🎮",
        },
        {
            "full_name": "Ananya Negi",
            "username": "ananya_gehu",
            "email": "ananya.negi@gehu.ac.in",
            "phone_number": "9876510004",
            "password": "Campus@2026",
            "gender": "Female",
            "admission_number": "GEHU2024MBA04",
            "course_id": 7, # GEHU MBA
            "branch_id": 13, # GEHU MBA Core
            "academic_year_id": 19, # GEHU 1st Year
            "bio": "MBA 1st Year GEHU • Marketing & Campus Event Coordinator 📊",
        },
        {
            "full_name": "Tanmay Bhatt",
            "username": "tanmay_gehu",
            "email": "tanmay.bhatt@gehu.ac.in",
            "phone_number": "9876510005",
            "password": "Campus@2026",
            "gender": "Male",
            "admission_number": "GEHU2024MCA05",
            "course_id": 8, # GEHU MCA
            "branch_id": 14, # GEHU MCA Core
            "academic_year_id": 22, # GEHU 2nd Year
            "bio": "MCA 2nd Year • Full Stack Engineer • Competitive Programming ⚡",
        },
    ]

    for data in STUDENTS:
        # Create or update User
        user, created = User.objects.get_or_create(
            email=data["email"],
            defaults={
                "full_name": data["full_name"],
                "phone_number": data["phone_number"],
                "is_verified_student": True,
                "is_email_verified": True,
                "is_phone_verified": True,
                "is_active": True,
            }
        )
        user.full_name = data["full_name"]
        user.phone_number = data["phone_number"]
        user.is_verified_student = True
        user.is_email_verified = True
        user.is_phone_verified = True
        user.set_password(data["password"])
        user.save()

        # Create or update StudentProfile
        profile, p_created = StudentProfile.objects.get_or_create(
            user=user,
            defaults={
                "username": data["username"],
                "college_id": gehu_college.id,
                "course_id": data["course_id"],
                "branch_id": data["branch_id"],
                "academic_year_id": data["academic_year_id"],
                "admission_number": data["admission_number"],
                "bio": data["bio"],
                "gender": data["gender"],
                "verified": True,
                "profile_completed": True,
                "verification_method": "ADMIN_VERIFIED",
            }
        )
        if not p_created:
            profile.username = data["username"]
            profile.college_id = gehu_college.id
            profile.course_id = data["course_id"]
            profile.branch_id = data["branch_id"]
            profile.academic_year_id = data["academic_year_id"]
            profile.admission_number = data["admission_number"]
            profile.bio = data["bio"]
            profile.gender = data["gender"]
            profile.verified = True
            profile.profile_completed = True
            profile.save()

        # Enroll in GEHU Communities
        CommunityMember.objects.get_or_create(community=gehu_comm, user=user)
        if data["course_id"] == 5:
            CommunityMember.objects.get_or_create(community=gehu_btech_comm, user=user)
            CommunityMember.objects.get_or_create(community=gehu_cse_comm, user=user)
        elif data["course_id"] == 6:
            CommunityMember.objects.get_or_create(community=gehu_bca_comm, user=user)
        elif data["course_id"] == 7:
            CommunityMember.objects.get_or_create(community=gehu_mba_comm, user=user)

        # Campus Clubs
        for club_name in ["ACM Student Chapter", "Google Developer Student Club (GDSC)"]:
            club = Community.objects.filter(name=club_name).first()
            if club:
                CommunityMember.objects.get_or_create(community=club, user=user)

        total_memberships = CommunityMember.objects.filter(user=user).count()
        print(f"[OK] {data['full_name']} (@{data['username']}) - Password: {data['password']} - Communities: {total_memberships}")

    print("\n--- All 5 Graphic Era Hill University accounts successfully configured! ---")

if __name__ == "__main__":
    seed_gehu_data()
