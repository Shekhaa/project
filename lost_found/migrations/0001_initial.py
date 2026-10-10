import uuid
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
            name='LostFoundPost',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('item_type', models.CharField(choices=[('LOST', 'Kho Gaya (Lost)'), ('FOUND', 'Mila Hai (Found)')], default='FOUND', max_length=10)),
                ('description', models.TextField(help_text='Direct descriptive message (e.g. Black Boat earbuds in CS Lab 3)')),
                ('location', models.CharField(help_text='Written location where it was lost or found', max_length=255)),
                ('image', models.ImageField(blank=True, null=True, upload_to='lost_found/')),
                ('status', models.CharField(choices=[('OPEN', 'Active / Unresolved'), ('RESOLVED', 'Claimed / Returned')], default='OPEN', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lost_found_posts', to=settings.AUTH_USER_MODEL)),
                ('college', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lost_found_items', to='colleges.college')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
