from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_alter_user_is_verified_student_campusinvitecode'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='deletion_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='scheduled_deletion_at',
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text='Account permanently deletes after this timestamp unless user logs back in.',
                null=True,
            ),
        ),
    ]
