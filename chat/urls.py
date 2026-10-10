from django.urls import path
from .views import (
    InboxView,
    StartDirectChatView,
    CreateEphemeralGroupView,
    ConversationMessagesView,
    SendMessageView,
)

urlpatterns = [
    path("inbox/", InboxView.as_view(), name="chat-inbox"),
    path("start/<str:identifier>/", StartDirectChatView.as_view(), name="chat-start"),
    path("ephemeral-group/create/", CreateEphemeralGroupView.as_view(), name="chat-ephemeral-create"),
    path("<uuid:conversation_id>/messages/", ConversationMessagesView.as_view(), name="chat-messages"),
    path("<uuid:conversation_id>/send/", SendMessageView.as_view(), name="chat-send"),
]
