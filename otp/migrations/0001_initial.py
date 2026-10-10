import uuid
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='OTP',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('destination', models.CharField(db_index=True, help_text='Email address or phone number', max_length=255)),
                ('otp', models.CharField(max_length=6)),
                ('purpose', models.CharField(choices=[('EMAIL_LOGIN', 'Email Login / Registration'), ('PHONE_VERIFY', 'Phone Verification'), ('PASSWORD_RESET', 'Password Reset'), ('DEVICE_CHANGE', 'Device Change Verification')], default='EMAIL_LOGIN', max_length=30)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('max_attempts', models.PositiveSmallIntegerField(default=5)),
                ('is_used', models.BooleanField(default=False)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['destination', 'purpose', 'is_used'], name='otp_otp_destina_84ffcb_idx')],
            },
        ),
    ]
