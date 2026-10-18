from django.urls import path
from .views import (
    InboxView,
    StartDirectChatView,
    CreateEphemeralGroupView,
    ConversationMessagesView,
    SendMessageView,
    DeleteMessageForMeView,
    UnsendMessageView,
    DeleteConversationView,
    ClearConversationMessagesView,
)

urlpatterns = [
    path("inbox/", InboxView.as_view(), name="chat-inbox"),
    path("start/<str:identifier>/", StartDirectChatView.as_view(), name="chat-start"),
    path("ephemeral-group/create/", CreateEphemeralGroupView.as_view(), name="chat-ephemeral-create"),
    path("<uuid:conversation_id>/messages/", ConversationMessagesView.as_view(), name="chat-messages"),
    path("<uuid:conversation_id>/send/", SendMessageView.as_view(), name="chat-send"),
    path("<uuid:conversation_id>/delete/", DeleteConversationView.as_view(), name="chat-delete"),
    path("<uuid:conversation_id>/clear/", ClearConversationMessagesView.as_view(), name="chat-clear"),
    path("messages/<uuid:message_id>/delete-for-me/", DeleteMessageForMeView.as_view(), name="chat-message-delete-for-me"),
    path("messages/<uuid:message_id>/unsend/", UnsendMessageView.as_view(), name="chat-message-unsend"),
]
