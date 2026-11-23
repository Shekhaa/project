import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from accounts.models import User
from posts.models import Post, Poll, PollOption, PollVote
from communities.models import Community

def seed_polls():
    print("--- Seeding Campus Wedge Polls ---")
    
    # Target GEHU or general student author
    author = User.objects.filter(email="aarav.joshi@gehu.ac.in").first()
    if not author:
        author = User.objects.filter(is_verified_student=True).first()
    if not author:
        author = User.objects.first()
        
    if not author:
        print("No student user found to author polls. Aborting.")
        return

    # Find community
    gehu_comm = Community.objects.filter(name__icontains="Graphic Era").first()
    if not gehu_comm:
        gehu_comm = Community.objects.first()

    polls_data = [
        {
            "content": "Tomorrow 8:45 AM Lab: kaun kaun attend kar raha hai? (Attendance ka kya scene hai?) 😴",
            "question": "Tomorrow 8:45 AM Lab Attendance?",
            "options": [
                "Pakka attendance hogi, main aa raha hu 🙋‍♂️",
                "Proxy lagwa dunga dost se 🤫",
                "Full bunk, bed se nahi uthna 😴",
                "Only 2nd half classes attend karunga ☕"
            ],
            "voters_distribution": [0, 1, 0, 2] # option indices for other seeded students
        },
        {
            "content": "Midterms alert! 📚 DAA / DSA Midterm mein sabse difficult topic kaun sa lag raha hai sabko?",
            "question": "DAA / DSA Midterm: Hardest Topic?",
            "options": [
                "Dynamic Programming (DP)",
                "Greedy Algorithms",
                "Graph Traversals (BFS / DFS)",
                "Bhai abhi syllabus hi nahi dekha 💀"
            ],
            "voters_distribution": [0, 3, 0, 3]
        },
        {
            "content": "Quick lunch break debate! GEU / GEHU Campus mein best quick snack spot right now? 🍔☕",
            "question": "Best Campus Snack Spot?",
            "options": [
                "Main Canteen Cold Coffee & Sandwich",
                "Maggie Hotspot near CS Block",
                "Chai & Samosa outside Gate 2",
                "Hostel Mess hi kafi hai (dard) 🥲"
            ],
            "voters_distribution": [0, 1, 1, 2]
        }
    ]

    other_students = list(User.objects.filter(is_verified_student=True).exclude(id=author.id)[:5])

    for p in polls_data:
        existing_poll = Poll.objects.filter(question=p["question"]).first()
        if existing_poll:
            print(f"Poll already exists: '{p['question']}'")
            continue

        post = Post.objects.create(
            author=author,
            community=gehu_comm,
            content=p["content"],
            visibility="COLLEGE" if gehu_comm else "GLOBAL",
            media_type="TEXT"
        )

        poll = Poll.objects.create(
            post=post,
            question=p["question"]
        )

        created_options = []
        for idx, opt_text in enumerate(p["options"]):
            opt = PollOption.objects.create(
                poll=poll,
                text=opt_text,
                order=idx
            )
            created_options.append(opt)

        print(f"Created poll '{poll.question}' (Post ID #{post.id}) with {len(created_options)} options")

        # Cast realistic initial votes using other seeded students
        for student_idx, opt_idx in enumerate(p["voters_distribution"]):
            if student_idx < len(other_students) and opt_idx < len(created_options):
                voter = other_students[student_idx]
                PollVote.objects.get_or_create(
                    poll=poll,
                    user=voter,
                    defaults={"option": created_options[opt_idx]}
                )

    print("--- Campus Polls Seeding Completed Successfully! ---")

if __name__ == '__main__':
    seed_polls()
