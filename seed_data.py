import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'social_network.settings')
django.setup()

from django.contrib.auth.models import User
from accounts.models import Profile, Follow
from posts.models import Post, Comment

def create_seed_data():
    print("Seeding initial social network demo data...")

    # 1. Create Superuser / Admin
    admin_user, created = User.objects.get_or_create(
        username='admin',
        defaults={
            'email': 'admin@socialpulse.local',
            'first_name': 'Admin',
            'last_name': 'Superuser',
            'is_staff': True,
            'is_superuser': True
        }
    )
    if created:
        admin_user.set_password('admin123')
        admin_user.save()
        admin_user.profile.bio = "System Administrator & Platform Architect."
        admin_user.profile.location = "San Francisco, CA"
        admin_user.profile.save()
        print(" -> Created Admin user: admin / admin123")

    # 2. Demo Users
    users_data = [
        {
            'username': 'alex_dev',
            'first_name': 'Alex',
            'last_name': 'Rivera',
            'email': 'alex@example.com',
            'bio': 'Full-stack software engineer & open source enthusiast. Building with Python & Django.',
            'location': 'Seattle, WA',
            'website': 'https://github.com'
        },
        {
            'username': 'sarah_ui',
            'first_name': 'Sarah',
            'last_name': 'Chen',
            'email': 'sarah@example.com',
            'bio': 'UI/UX Product Designer. Crafting accessible, delightful micro-interactions & design systems.',
            'location': 'New York, NY',
            'website': 'https://dribbble.com'
        },
        {
            'username': 'david_ai',
            'first_name': 'David',
            'last_name': 'Kovacs',
            'email': 'david@example.com',
            'bio': 'AI researcher & builder. Exploring multimodal agents, LLMs, and real-time streaming interfaces.',
            'location': 'Austin, TX',
            'website': 'https://huggingface.co'
        }
    ]

    demo_users = []
    for u_info in users_data:
        user, created = User.objects.get_or_create(
            username=u_info['username'],
            defaults={
                'first_name': u_info['first_name'],
                'last_name': u_info['last_name'],
                'email': u_info['email'],
            }
        )
        if created:
            user.set_password('demo1234')
            user.save()
            user.profile.bio = u_info['bio']
            user.profile.location = u_info['location']
            user.profile.website = u_info['website']
            user.profile.save()
            print(f" -> Created demo user: @{user.username} (password: demo1234)")
        demo_users.append(user)

    # 3. Follow connections
    if len(demo_users) >= 3:
        Follow.objects.get_or_create(follower=demo_users[0], following=demo_users[1])
        Follow.objects.get_or_create(follower=demo_users[1], following=demo_users[2])
        Follow.objects.get_or_create(follower=demo_users[2], following=demo_users[0])
        Follow.objects.get_or_create(follower=admin_user, following=demo_users[0])
        Follow.objects.get_or_create(follower=admin_user, following=demo_users[1])

    # 4. Seed sample posts
    sample_posts = [
        (demo_users[0], "Just shipped a fresh update to our Django backend! 🚀 Clean modular architecture with dedicated apps for Auth, Posts, Messaging, and WebRTC Calling. Loving the developer experience."),
        (demo_users[1], "Minimalism in UI design isn't about having less; it's about making every pixel count. Dark mode + violet accent gradients are hitting just right on this interface. What do you think? ✨"),
        (demo_users[2], "Excited about the future of autonomous agentic systems and WebSockets! Real-time bidirectional streaming is changing how applications connect people worldwide. 🌐💡"),
        (admin_user, "Welcome to SocialPulse! 🌟 This platform is engineered with Python Django, ready for direct messaging, audio/video calling, explore feeds, and instant media sharing.")
    ]

    for author, text in sample_posts:
        post, p_created = Post.objects.get_or_create(
            author=author,
            content=text
        )
        if p_created:
            # Add likes
            for u in demo_users:
                post.likes.add(u)
            # Add comments
            Comment.objects.create(
                post=post,
                author=demo_users[1] if author != demo_users[1] else demo_users[0],
                content="Looks fantastic! Congratulations on the launch! 🎉"
            )

    print("Seeding complete! You have demo users and sample posts ready.")

if __name__ == '__main__':
    create_seed_data()
