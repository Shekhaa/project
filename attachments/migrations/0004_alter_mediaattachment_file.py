# Generated manually for Cloudinary storage URL support
import attachments.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attachments', '0003_mediaattachment_discussion_reply_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='mediaattachment',
            name='file',
            field=models.FileField(max_length=500, upload_to=attachments.models.attachment_upload_path),
        ),
    ]
