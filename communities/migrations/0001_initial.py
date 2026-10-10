import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Community',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('slug', models.SlugField(blank=True, max_length=255, unique=True)),
                ('community_type', models.CharField(choices=[('COLLEGE', 'College'), ('COURSE', 'Course'), ('BRANCH', 'Branch'), ('YEAR', 'Academic Year'), ('SECTION', 'Section'), ('CLUB', 'Student Club / Society'), ('CUSTOM', 'Custom')], max_length=20)),
                ('description', models.TextField(blank=True)),
                ('image', models.ImageField(blank=True, null=True, upload_to='community_images/')),
                ('is_private', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name_plural': 'Communities',
                'ordering': ['name'],
                'unique_together': {('name', 'community_type')},
            },
        ),
        migrations.CreateModel(
            name='CommunityMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('community', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='communities.community')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='community_memberships', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['joined_at'],
                'unique_together': {('community', 'user')},
            },
        ),
    ]
