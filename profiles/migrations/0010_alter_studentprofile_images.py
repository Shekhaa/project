# Generated manually for Cloudinary storage URL support
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('profiles', '0009_pendingidcardapproval'),
    ]

    operations = [
        migrations.AlterField(
            model_name='studentprofile',
            name='profile_picture',
            field=models.ImageField(blank=True, max_length=500, null=True, upload_to='profile_pictures/'),
        ),
        migrations.AlterField(
            model_name='studentprofile',
            name='id_card_image',
            field=models.ImageField(blank=True, max_length=500, null=True, upload_to='id_cards/'),
        ),
    ]
