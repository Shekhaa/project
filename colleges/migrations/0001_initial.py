import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='College',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, unique=True)),
                ('short_name', models.CharField(max_length=20, unique=True)),
                ('logo', models.ImageField(blank=True, null=True, upload_to='college_logos/')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='CollegeDomain',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('domain', models.CharField(max_length=100, unique=True)),
                ('college', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='domains', to='colleges.college')),
            ],
            options={
                'ordering': ['domain'],
            },
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('code', models.CharField(blank=True, max_length=20, null=True)),
                ('duration', models.PositiveSmallIntegerField(help_text='Duration in years (e.g. 4 for B.Tech)')),
                ('display_order', models.PositiveSmallIntegerField(default=1)),
                ('college', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='courses', to='colleges.college')),
            ],
            options={
                'ordering': ['display_order', 'name'],
                'unique_together': {('college', 'name')},
            },
        ),
        migrations.CreateModel(
            name='Branch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('code', models.CharField(blank=True, max_length=20, null=True)),
                ('display_order', models.PositiveSmallIntegerField(default=1)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='branches', to='colleges.course')),
            ],
            options={
                'ordering': ['display_order', 'name'],
                'unique_together': {('course', 'name')},
            },
        ),
        migrations.CreateModel(
            name='AcademicYear',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year_number', models.PositiveSmallIntegerField()),
                ('display_name', models.CharField(max_length=30)),
                ('batch', models.PositiveIntegerField(blank=True, help_text='e.g. 2024', null=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='academic_years', to='colleges.course')),
            ],
            options={
                'ordering': ['year_number'],
                'unique_together': {('course', 'year_number')},
            },
        ),
        migrations.CreateModel(
            name='Section',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=20)),
                ('display_order', models.PositiveSmallIntegerField(default=1)),
                ('academic_year', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sections', to='colleges.academicyear')),
            ],
            options={
                'ordering': ['display_order', 'name'],
                'unique_together': {('academic_year', 'name')},
            },
        ),
    ]
