from django.contrib import admin
from .models import College, CollegeDomain, Course, Branch, AcademicYear, Section

class CollegeDomainInline(admin.TabularInline):
    model = CollegeDomain
    extra = 1

@admin.register(College)
class CollegeAdmin(admin.ModelAdmin):
    list_display = ("short_name", "name", "is_active", "created_at")
    search_fields = ("name", "short_name")
    list_filter = ("is_active",)
    inlines = [CollegeDomainInline]

@admin.register(CollegeDomain)
class CollegeDomainAdmin(admin.ModelAdmin):
    list_display = ("domain", "college")
    search_fields = ("domain", "college__name")

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "college", "duration", "display_order")
    list_filter = ("college",)
    search_fields = ("name", "code")

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "course", "display_order")
    list_filter = ("course__college", "course")
    search_fields = ("name", "code")

@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ("display_name", "year_number", "batch", "course")
    list_filter = ("course__college", "course")

@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ("name", "academic_year", "display_order")
    list_filter = ("academic_year__course",)
