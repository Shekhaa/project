# Generated manually for Cloudinary storage URL support
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0009_poll_polloption_pollvote'),
    ]

    operations = [
        migrations.AlterField(
            model_name='post',
            name='document',
            field=models.FileField(blank=True, max_length=500, null=True, upload_to='post_documents/'),
        ),
    ]
