import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('colleges', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='StudentProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('college_email', models.EmailField(blank=True, max_length=254, null=True, unique=True)),
                ('admission_number', models.CharField(blank=True, max_length=50, null=True)),
                ('username', models.CharField(db_index=True, max_length=50, unique=True)),
                ('bio', models.TextField(blank=True, max_length=500)),
                ('profile_picture', models.ImageField(blank=True, null=True, upload_to='profile_pictures/')),
                ('gender', models.CharField(choices=[('Male', 'Male'), ('Female', 'Female'), ('Other', 'Other')], max_length=20)),
                ('anonymous_enabled', models.BooleanField(default=False, help_text='Allow posting under anonymous pseudonyms')),
                ('verified', models.BooleanField(default=False)),
                ('profile_completed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('academic_year', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='profiles', to='colleges.academicyear')),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='profiles', to='colleges.branch')),
                ('college', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='profiles', to='colleges.college')),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='profiles', to='colleges.course')),
                ('section', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='profiles', to='colleges.section')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='profile', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['username'],
            },
        ),
    ]
