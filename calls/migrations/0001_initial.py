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
            name='CallSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('room_id', models.CharField(db_index=True, max_length=64, unique=True)),
                ('call_type', models.CharField(choices=[('AUDIO', 'Voice Call'), ('VIDEO', 'Video Call')], default='VIDEO', max_length=10)),
                ('status', models.CharField(choices=[('RINGING', 'Ringing'), ('ACCEPTED', 'Ongoing'), ('REJECTED', 'Declined'), ('MISSED', 'Missed Call'), ('ENDED', 'Completed')], default='RINGING', max_length=20)),
                ('sdp_offer', models.TextField(blank=True, null=True)),
                ('sdp_answer', models.TextField(blank=True, null=True)),
                ('ice_candidates', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('caller', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outgoing_calls', to=settings.AUTH_USER_MODEL)),
                ('receiver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_calls', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
