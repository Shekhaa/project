from django.urls import path
from .views import (
    CollegeListView,
    CourseListView,
    BranchListView,
    AcademicYearListView,
    SectionListView,
    DetectCollegeDomainView,
)

urlpatterns = [
    path("", CollegeListView.as_view(), name="college-list"),
    path("detect-domain/", DetectCollegeDomainView.as_view(), name="college-detect-domain"),
    path("<int:college_id>/courses/", CourseListView.as_view(), name="college-courses"),
    path("courses/<int:course_id>/branches/", BranchListView.as_view(), name="course-branches"),
    path("courses/<int:course_id>/years/", AcademicYearListView.as_view(), name="course-years"),
    path("academic-years/<int:year_id>/sections/", SectionListView.as_view(), name="year-sections"),
]
