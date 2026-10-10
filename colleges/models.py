from django.db import models

class College(models.Model):
    name = models.CharField(max_length=200, unique=True)
    short_name = models.CharField(max_length=20, unique=True)
    logo = models.ImageField(upload_to="college_logos/", blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.short_name} - {self.name}"


class CollegeDomain(models.Model):
    college = models.ForeignKey(
        College,
        on_delete=models.CASCADE,
        related_name="domains"
    )
    domain = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["domain"]

    def __str__(self):
        return f"{self.college.short_name} - {self.domain}"

    @classmethod
    def find_by_email(cls, email):
        """
        Auto-detects the CollegeDomain from a user's email address.
        Supports exact domain matches (e.g. student@geu.ac.in -> geu.ac.in)
        and subdomains (e.g. student@ug.geu.ac.in -> geu.ac.in).
        """
        if not email or "@" not in email:
            return None
        raw_domain = email.split("@")[-1].strip().lower()

        # 1. Exact match
        exact_match = cls.objects.filter(domain__iexact=raw_domain, college__is_active=True).first()
        if exact_match:
            return exact_match

        # 2. Suffix / Subdomain fallback (e.g., student.geu.ac.in -> geu.ac.in)
        parts = raw_domain.split(".")
        for i in range(1, len(parts) - 1):
            parent_domain = ".".join(parts[i:])
            parent_match = cls.objects.filter(domain__iexact=parent_domain, college__is_active=True).first()
            if parent_match:
                return parent_match

        return None


class Course(models.Model):
    college = models.ForeignKey(
        College,
        on_delete=models.CASCADE,
        related_name="courses"
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, null=True, blank=True)
    duration = models.PositiveSmallIntegerField(help_text="Duration in years (e.g. 4 for B.Tech)")
    display_order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = ("college", "name")

    def __str__(self):
        return f"{self.college.short_name} - {self.name}"


class Branch(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="branches"
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, null=True, blank=True)
    display_order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = ("course", "name")

    def __str__(self):
        return f"{self.course.name} - {self.name}"


class AcademicYear(models.Model):
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="academic_years"
    )
    year_number = models.PositiveSmallIntegerField()
    display_name = models.CharField(max_length=30)
    batch = models.PositiveIntegerField(null=True, blank=True, help_text="e.g. 2024")

    class Meta:
        ordering = ["year_number"]
        unique_together = ("course", "year_number")

    def __str__(self):
        if self.batch:
            return f"{self.course.name} - {self.display_name} ({self.batch})"
        return f"{self.course.name} - {self.display_name}"


class Section(models.Model):
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name="sections"
    )
    name = models.CharField(max_length=20)
    display_order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["display_order", "name"]
        unique_together = ("academic_year", "name")

    def __str__(self):
        return f"{self.academic_year.course.name} {self.academic_year.display_name} - {self.name}"
