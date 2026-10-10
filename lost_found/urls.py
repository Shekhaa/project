from django.urls import path
from .views import (
    LostFoundListView,
    CreateLostFoundPostView,
    ResolveLostFoundPostView,
    ContactReporterView,
)

urlpatterns = [
    path("", LostFoundListView.as_view(), name="lost-found-list"),
    path("create/", CreateLostFoundPostView.as_view(), name="lost-found-create"),
    path("<uuid:item_id>/resolve/", ResolveLostFoundPostView.as_view(), name="lost-found-resolve"),
    path("<uuid:item_id>/contact/", ContactReporterView.as_view(), name="lost-found-contact"),
]
