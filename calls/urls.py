from django.urls import path
from .views import (
    InitiateCallView,
    AnswerCallView,
    IceCandidateExchangeView,
    CallStatusView,
    EndCallView,
    ActiveCallsListView,
)

urlpatterns = [
    path("initiate/", InitiateCallView.as_view(), name="call-initiate"),
    path("active/", ActiveCallsListView.as_view(), name="call-active-list"),
    path("<str:room_id>/status/", CallStatusView.as_view(), name="call-status"),
    path("<str:room_id>/answer/", AnswerCallView.as_view(), name="call-answer"),
    path("<str:room_id>/ice-candidate/", IceCandidateExchangeView.as_view(), name="call-ice-candidate"),
    path("<str:room_id>/end/", EndCallView.as_view(), name="call-end"),
]
