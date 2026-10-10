from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('chat', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='conversation',
            name='is_ephemeral',
            field=models.BooleanField(default=False, help_text='Auto-deletes when duration expires'),
        ),
        migrations.AddField(
            model_name='conversation',
            name='duration',
            field=models.CharField(
                blank=True,
                choices=[
                    ('10_MIN', '10 Minutes (Instant Hangout)'),
                    ('1_HOUR', '1 Hour (Lunch / Canteen)'),
                    ('12_HOURS', '12 Hours (Tonight Study Session)'),
                    ('24_HOURS', '24 Hours (Weekend Trip / Event)'),
                ],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='conversation',
            name='purpose_tag',
            field=models.CharField(blank=True, default='', help_text='e.g. Trip, Canteen, Study, Gaming', max_length=50),
        ),
        migrations.AddField(
            model_name='conversation',
            name='expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
