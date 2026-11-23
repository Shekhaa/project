from django.urls import path
from .views import (
    LostFoundListView,
    CreateLostFoundPostView,
    ResolveLostFoundPostView,
    DeleteLostFoundPostView,
    ContactReporterView,
)

urlpatterns = [
    path("", LostFoundListView.as_view(), name="lost-found-list"),
    path("create/", CreateLostFoundPostView.as_view(), name="lost-found-create"),
    path("report/", CreateLostFoundPostView.as_view(), name="lost-found-report"),
    path("<uuid:item_id>/", DeleteLostFoundPostView.as_view(), name="lost-found-detail-delete"),
    path("<uuid:item_id>/delete/", DeleteLostFoundPostView.as_view(), name="lost-found-delete"),
    path("<uuid:item_id>/resolve/", ResolveLostFoundPostView.as_view(), name="lost-found-resolve"),
    path("<uuid:item_id>/contact/", ContactReporterView.as_view(), name="lost-found-contact"),
]
