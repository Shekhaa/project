import uuid
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
            name='Device',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('device_uuid', models.CharField(max_length=255, unique=True)),
                ('device_name', models.CharField(max_length=100)),
                ('manufacturer', models.CharField(blank=True, max_length=100, null=True)),
                ('model', models.CharField(blank=True, max_length=100, null=True)),
                ('os', models.CharField(blank=True, max_length=50, null=True)),
                ('os_version', models.CharField(blank=True, max_length=50, null=True)),
                ('browser', models.CharField(blank=True, max_length=100, null=True)),
                ('app_version', models.CharField(blank=True, max_length=30, null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('is_primary', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('last_login', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='devices', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-last_login'],
            },
        ),
        migrations.CreateModel(
            name='DeviceLinkChallenge',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('challenge_token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('web_device_uuid', models.CharField(blank=True, default='', max_length=255)),
                ('web_browser_info', models.CharField(blank=True, default='', max_length=255)),
                ('status', models.CharField(choices=[('PENDING', 'Pending Mobile Scan'), ('AUTHORIZED', 'Authorized by Mobile'), ('EXPIRED', 'Expired'), ('CONSUMED', 'Session Established')], default='PENDING', max_length=20)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='qr_link_challenges', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
