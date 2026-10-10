import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from colleges.models import College, CollegeDomain, Course, Branch, AcademicYear, Section
from communities.models import Community, CommunityMember
from profiles.models import StudentProfile
from posts.models import Post, PostLike, Comment
from chat.models import Conversation, ConversationMember, Message
from lost_found.models import LostFoundPost

User = get_user_model()

def seed():
    print("==================================================")
    print("  Seeding Campus Connect Canonical College Data")
    print("==================================================")

    # 1. Colleges & CollegeDomains
    geu, _ = College.objects.get_or_create(
        name="Graphic Era University",
        defaults={"short_name": "GEU"}
    )
    CollegeDomain.objects.get_or_create(college=geu, domain="geu.ac.in")

    gehu, _ = College.objects.get_or_create(
        name="Graphic Era Hill University",
        defaults={"short_name": "GEHU"}
    )
    CollegeDomain.objects.get_or_create(college=gehu, domain="gehu.ac.in")

    colleges = [geu, gehu]
    print(" -> Seeded Colleges: GEU & GEHU with domains (geu.ac.in, gehu.ac.in)")

    # 2. Courses
    courses_spec = [
        ("B.Tech", "BT", 4),
        ("BCA", "BCA", 3),
        ("MBA", "MBA", 2),
        ("MCA", "MCA", 2),
    ]

    all_courses = []
    for col in colleges:
        for c_name, c_code, duration in courses_spec:
            course, _ = Course.objects.get_or_create(
                college=col,
                name=c_name,
                defaults={"code": c_code, "duration": duration}
            )
            all_courses.append(course)

    print(" -> Seeded Courses: B.Tech, BCA, MBA, MCA across colleges")

    # 3. Branches
    branches_spec = [
        ("Computer Science & Engineering", "CSE"),
        ("AI & Machine Learning", "AIML"),
        ("Information Technology", "IT"),
        ("Electronics & Communication", "ECE"),
    ]

    for course in all_courses:
        if course.name == "B.Tech":
            for b_name, b_code in branches_spec:
                Branch.objects.get_or_create(
                    course=course,
                    name=b_name,
                    defaults={"code": b_code}
                )
        else:
            Branch.objects.get_or_create(
                course=course,
                name=f"{course.name} Core",
                defaults={"code": "GEN"}
            )

    print(" -> Seeded Branches: B.Tech (CSE, AIML, IT, ECE), BCA, MBA, MCA")

    # 4. Academic Years & Sections
    year_labels = ["First Year", "Second Year", "Third Year", "Fourth Year"]
    for course in all_courses:
        for y_idx in range(1, course.duration + 1):
            year, _ = AcademicYear.objects.get_or_create(
                course=course,
                year_number=y_idx,
                defaults={
                    "display_name": year_labels[y_idx - 1],
                    "batch": 2024 + (y_idx - 1)
                }
            )
            # Create Section A and Section B for each year
            Section.objects.get_or_create(academic_year=year, name="Section A")
            Section.objects.get_or_create(academic_year=year, name="Section B")

    print(" -> Seeded Academic Years (1-4) and Sections (A, B)")

    # 5. Campus Clubs (Opt-In Communities)
    clubs = [
        ("Google Developer Student Club (GDSC)", "gdsc-campus", "Official campus developer community for tech & workshops"),
        ("ACM Student Chapter", "acm-chapter", "Competitive programming, research and hackathons"),
        ("Cultural & Arts Society", "cultural-society", "Music, dance, dramatics and campus festivals"),
        ("Sports Council", "sports-council", "Campus athletics, football, basketball & tournaments"),
    ]
    for name, slug, desc in clubs:
        Community.objects.get_or_create(
            name=name,
            community_type="CLUB",
            defaults={"slug": slug, "description": desc}
        )
    print(" -> Seeded Student Clubs & Societies")

    # 6. Admin User
    admin_user, admin_created = User.objects.get_or_create(
        email="admin@campusconnect.local",
        defaults={
            "full_name": "Campus Admin",
            "is_staff": True,
            "is_superuser": True,
            "is_email_verified": True,
            "is_phone_verified": True,
            "is_verified_student": True,
        }
    )
    if admin_created:
        admin_user.set_password("admin123")
        admin_user.save()
        print(" -> Created Admin Superuser: admin@campusconnect.local / admin123")

    # 7. Seed 12 Diverse Campus Students
    print("\n[7/7] Seeding 12 Realistic Campus Students & Interactions...")

    demo_students = [
        {
            "email": "student@geu.ac.in",
            "name": "Aarav Sharma",
            "username": "aarav_cse",
            "gender": "Male",
            "course": "B.Tech",
            "branch": "CSE",
            "year": 1,
            "section": "Section A",
            "roll": "GEU/24/CS/042",
            "bio": "B.Tech CSE '28. Passionate about distributed systems, React Native & hackathons! 🚀",
            "post": "Welcome everyone to Campus Connect! Excited to connect with all seniors, batchmates, and club leads across departments. 🚀🎓",
            "anon_post": "Is there any extra credit for lab submissions this Friday?",
            "anon_alias": "Anonymous Owl"
        },
        {
            "email": "priya.verma@geu.ac.in",
            "name": "Priya Verma",
            "username": "priya_cse",
            "gender": "Female",
            "course": "B.Tech",
            "branch": "CSE",
            "year": 1,
            "section": "Section A",
            "roll": "GEU/24/CS/108",
            "bio": "First-year computer science engineer. Building cool stuff with Python & Django! 💻✨",
            "post": "Hey Graphic Era! So excited to begin the new semester and meet everyone! 👋🎉",
            "anon_post": "Does anyone know the syllabus for mid-terms mathematics?",
            "anon_alias": "Anonymous Fox"
        },
        {
            "email": "rohan.mehta@geu.ac.in",
            "name": "Rohan Mehta",
            "username": "rohan_aiml",
            "gender": "Male",
            "course": "B.Tech",
            "branch": "AIML",
            "year": 2,
            "section": "Section A",
            "roll": "GEU/23/AI/015",
            "bio": "Sophomore in AI & ML. Kaggle enthusiast, computer vision researcher. 🤖",
            "post": "Organizing a mini AI workshop this Saturday in CS Lab 2! Who's in? 🧠🔥",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "sneha.patel@geu.ac.in",
            "name": "Sneha Patel",
            "username": "sneha_it",
            "gender": "Female",
            "course": "B.Tech",
            "branch": "IT",
            "year": 3,
            "section": "Section B",
            "roll": "GEU/22/IT/089",
            "bio": "Junior in IT. Open source contributor & GDSC Lead. Ping me for mentorship! 🌟",
            "post": "GDSC orientation registration is now live on the portal. Don't miss out! 🚀",
            "anon_post": "Be honest: which canteen has the best cold coffee on campus?",
            "anon_alias": "Anonymous Panda"
        },
        {
            "email": "kabir.singh@geu.ac.in",
            "name": "Kabir Singh",
            "username": "kabir_bca",
            "gender": "Male",
            "course": "BCA",
            "branch": None,
            "year": 1,
            "section": "Section A",
            "roll": "GEU/24/BCA/033",
            "bio": "BCA 1st Year. Full-stack web dev & esports gamer. Valorant main. 🎮🕹️",
            "post": "LAN gaming night tournament coming up! Forming a 5-man Valorant squad. DM me! 🎯",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "ananya.roy@geu.ac.in",
            "name": "Ananya Roy",
            "username": "ananya_mba",
            "gender": "Female",
            "course": "MBA",
            "branch": None,
            "year": 1,
            "section": "Section A",
            "roll": "GEU/24/MBA/012",
            "bio": "MBA in Marketing & Finance. Debater, event organizer & coffee addict ☕📊",
            "post": "Management Fest 'Spardha 2026' auditions start next Wednesday in Audi 2! 🏆",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "vikram.malhotra@geu.ac.in",
            "name": "Vikram Malhotra",
            "username": "vikram_cse",
            "gender": "Male",
            "course": "B.Tech",
            "branch": "CSE",
            "year": 4,
            "section": "Section B",
            "roll": "GEU/21/CS/003",
            "bio": "Final year CSE. Placed at Microsoft. Happy to review resumes & conduct mock interviews! 💼🎯",
            "post": "Tip for 2nd & 3rd years: Focus on core DSA & system design fundamentals early. Placement season moves fast! 💡",
            "anon_post": "Placement drive company list will be posted on notice board tomorrow morning.",
            "anon_alias": "Anonymous Falcon"
        },
        {
            "email": "tanvi.joshi@geu.ac.in",
            "name": "Tanvi Joshi",
            "username": "tanvi_design",
            "gender": "Female",
            "course": "B.Tech",
            "branch": "CSE",
            "year": 2,
            "section": "Section A",
            "roll": "GEU/23/CS/142",
            "bio": "UI/UX Designer & Frontend enthusiast. Figma freak & illustrator. 🎨🖌️",
            "post": "Just published the redesign of our college festival website mockup! What do you guys think? 🎨👀",
            "media_type": "IMAGE",
            "media_url": "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=800&auto=format&fit=crop",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "siddharth.rao@geu.ac.in",
            "name": "Siddharth Rao",
            "username": "sid_robotics",
            "gender": "Male",
            "course": "B.Tech",
            "branch": "ECE",
            "year": 2,
            "section": "Section A",
            "roll": "GEU/23/EC/077",
            "bio": "Hardware hacker, drone builder, robotics club co-lead. 🚁⚡",
            "post": "Drone test flight scheduled for tomorrow 4 PM on the football ground! 🛸✨ Check out the test footage!",
            "media_type": "VIDEO",
            "media_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "diya.sen@geu.ac.in",
            "name": "Diya Sen",
            "username": "diya_ecell",
            "gender": "Female",
            "course": "MBA",
            "branch": None,
            "year": 2,
            "section": "Section A",
            "roll": "GEU/23/MBA/044",
            "bio": "E-Cell President. Startup mentor, investor relations & public speaker. 🚀📈",
            "post": "Pitching for the Campus Shark Tank begins next month with ₹5 Lakh seed funding pool! 💼💰",
            "media_type": "IMAGE",
            "media_url": "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&auto=format&fit=crop",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "aman.gupta@geu.ac.in",
            "name": "Aman Gupta",
            "username": "aman_gaming",
            "gender": "Male",
            "course": "B.Tech",
            "branch": "CSE",
            "year": 1,
            "section": "Section A",
            "roll": "GEU/24/CS/199",
            "bio": "Freshman CS engineer. BGMI tier-1 player & game developer in Unity. 🎮🔥",
            "post": "Looking for 2 more players for the Inter-College BGMI Championship qualifiers! 🏆📱",
            "media_type": "IMAGE",
            "media_url": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop",
            "anon_post": None,
            "anon_alias": None
        },
        {
            "email": "neha.kapoor@geu.ac.in",
            "name": "Neha Kapoor",
            "username": "neha_dance",
            "gender": "Female",
            "course": "BCA",
            "branch": None,
            "year": 2,
            "section": "Section A",
            "roll": "GEU/23/BCA/081",
            "bio": "Dance Society Captain. Classical & Hip-hop choreographer. 💃🎵",
            "post": "Auditions for the Annual Fest Western Dance Troupe start this Friday in Gym Hall! 💃🎶",
            "media_type": "VIDEO",
            "media_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
            "anon_post": None,
            "anon_alias": None
        }
    ]

    col_comm = Community.objects.filter(community_type="COLLEGE", name=geu.name).first()
    created_users = []

    for spec in demo_students:
        user, u_created = User.objects.get_or_create(
            email=spec["email"],
            defaults={
                "full_name": spec["name"],
                "phone_number": f"+91987654{len(created_users):04d}",
                "is_email_verified": True,
                "is_phone_verified": True,
                "is_verified_student": True,
            }
        )
        user.set_password("student123")
        user.save()
        created_users.append(user)

        course_obj = Course.objects.filter(college=geu, name=spec["course"]).first()
        branch_obj = None
        if spec["branch"]:
            branch_obj = Branch.objects.filter(course=course_obj, code=spec["branch"]).first()
        if not branch_obj:
            branch_obj = Branch.objects.filter(course=course_obj).first()
        year_obj = AcademicYear.objects.filter(course=course_obj, year_number=spec["year"]).first()
        sec_obj = Section.objects.filter(academic_year=year_obj, name=spec["section"]).first()

        StudentProfile.objects.update_or_create(
            user=user,
            defaults={
                "username": spec["username"],
                "bio": spec["bio"],
                "gender": spec["gender"],
                "anonymous_enabled": True,
                "college_email": spec["email"],
                "admission_number": spec["roll"],
                "college": geu,
                "course": course_obj,
                "branch": branch_obj,
                "academic_year": year_obj,
                "section": sec_obj,
                "verified": True,
                "profile_completed": True
            }
        )

        # Enroll in core communities
        if col_comm:
            CommunityMember.objects.get_or_create(community=col_comm, user=user)

        # Public post
        if col_comm and spec.get("post"):
            p, _ = Post.objects.get_or_create(
                community=col_comm,
                author=user,
                content=spec["post"],
                defaults={
                    "is_anonymous": False,
                    "media_type": spec.get("media_type", "TEXT"),
                    "media_url": spec.get("media_url", "")
                }
            )
            if spec.get("media_url") and p.media_url != spec["media_url"]:
                p.media_type = spec.get("media_type", "TEXT")
                p.media_url = spec["media_url"]
                p.save(update_fields=["media_type", "media_url"])

        # Anonymous post
        if col_comm and spec.get("anon_post"):
            Post.objects.get_or_create(
                community=col_comm,
                author=user,
                content=spec["anon_post"],
                defaults={"is_anonymous": True, "anonymous_alias": spec["anon_alias"]}
            )

    print(f" -> Seeded {len(created_users)} verified students with profiles, media posts & interactions.")

    # Seed Sample Comments & Likes
    sample_posts = Post.objects.filter(is_anonymous=False)[:4]
    for idx, p in enumerate(sample_posts):
        other_user = created_users[(idx + 1) % len(created_users)]
        third_user = created_users[(idx + 2) % len(created_users)]
        PostLike.objects.get_or_create(post=p, user=other_user)
        PostLike.objects.get_or_create(post=p, user=third_user)
        Comment.objects.get_or_create(
            post=p,
            user=other_user,
            text="Awesome initiative! Count me in 🚀🔥",
            defaults={"is_anonymous": False}
        )
        Comment.objects.get_or_create(
            post=p,
            user=third_user,
            text="Where can we get more details on this? DM sent!",
            defaults={"is_anonymous": False}
        )

    # 8. Seed Sample 1-on-1 Chats Between Students
    print("\n[8/8] Seeding sample 1-to-1 conversations...")
    aarav = created_users[0]
    priya = created_users[1]
    rohan = created_users[2]
    vikram = created_users[6]

    def get_or_create_dm(u1, u2, name=""):
        convs = Conversation.objects.filter(is_group=False, members__user=u1).filter(members__user=u2)
        if convs.exists():
            return convs.first()
        c = Conversation.objects.create(is_group=False, is_ephemeral=False, name=name)
        ConversationMember.objects.create(conversation=c, user=u1, is_admin=True)
        ConversationMember.objects.create(conversation=c, user=u2)
        return c

    # Chat 1: Priya & Aarav (Hackathon discussion)
    c1 = get_or_create_dm(aarav, priya)

    Message.objects.get_or_create(
        conversation=c1,
        sender=priya,
        text="Hey Aarav! Have you formed a team for the Smart India Hackathon yet?"
    )
    Message.objects.get_or_create(
        conversation=c1,
        sender=aarav,
        text="Hey Priya! Not yet, looking for one more frontend person. Want to team up?"
    )
    Message.objects.get_or_create(
        conversation=c1,
        sender=priya,
        text="Definitely! Let's discuss the problem statements after lab today."
    )

    # Chat 2: Rohan & Vikram (Senior mentorship / Placement prep)
    c2 = get_or_create_dm(vikram, rohan, name="Mentorship")

    Message.objects.get_or_create(
        conversation=c2,
        sender=rohan,
        text="Bhaiya, could you take a quick look at my resume when you're free?"
    )
    Message.objects.get_or_create(
        conversation=c2,
        sender=vikram,
        text="Sure Rohan! Send it over. Focus on quantifiable impact in your project bullet points."
    )

    # Sample Lost & Found item
    LostFoundPost.objects.get_or_create(
        college=geu,
        author=aarav,
        description="Blue Dell laptop charger found near Library ground floor charging socket.",
        defaults={
            "item_type": "FOUND",
            "location": "Central Library Ground Floor"
        }
    )

    print("\n==================================================")
    print("  Canonical Seeding Complete (12 Students + Chats)!")
    print("==================================================")

if __name__ == "__main__":
    seed()

