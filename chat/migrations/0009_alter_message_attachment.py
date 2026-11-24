# Generated manually for Cloudinary storage URL support
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0008_conversation_anonymous_sender'),
    ]

    operations = [
        migrations.AlterField(
            model_name='message',
            name='attachment',
            field=models.FileField(blank=True, max_length=500, null=True, upload_to='chat_attachments/'),
        ),
    ]
