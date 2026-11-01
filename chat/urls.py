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
    AddConversationMembersView,
    ConversationInviteLinkView,
    JoinByConversationInviteView,
    MessageRequestsListView,
    AcceptMessageRequestView,
    DeclineMessageRequestView,
    BlockMessageRequestView,
)

urlpatterns = [
    path("inbox/", InboxView.as_view(), name="chat-inbox"),
    path("start/<str:identifier>/", StartDirectChatView.as_view(), name="chat-start"),
    path("ephemeral-group/create/", CreateEphemeralGroupView.as_view(), name="chat-ephemeral-create"),
    path("invite/<str:invite_code>/", JoinByConversationInviteView.as_view(), name="chat-join-by-invite"),

    # Message Requests (Safe Direct Messaging)
    path("message-requests/", MessageRequestsListView.as_view(), name="chat-message-requests-list"),
    path("message-requests/<uuid:request_id>/accept/", AcceptMessageRequestView.as_view(), name="chat-message-request-accept"),
    path("message-requests/<uuid:request_id>/decline/", DeclineMessageRequestView.as_view(), name="chat-message-request-decline"),
    path("message-requests/<uuid:request_id>/block/", BlockMessageRequestView.as_view(), name="chat-message-request-block"),

    path("<uuid:conversation_id>/messages/", ConversationMessagesView.as_view(), name="chat-messages"),
    path("<uuid:conversation_id>/send/", SendMessageView.as_view(), name="chat-send"),
    path("<uuid:conversation_id>/add-members/", AddConversationMembersView.as_view(), name="chat-add-members"),
    path("<uuid:conversation_id>/invite-link/", ConversationInviteLinkView.as_view(), name="chat-invite-link"),
    path("<uuid:conversation_id>/delete/", DeleteConversationView.as_view(), name="chat-delete"),
    path("<uuid:conversation_id>/clear/", ClearConversationMessagesView.as_view(), name="chat-clear"),
    path("messages/<uuid:message_id>/delete-for-me/", DeleteMessageForMeView.as_view(), name="chat-message-delete-for-me"),
    path("messages/<uuid:message_id>/unsend/", UnsendMessageView.as_view(), name="chat-message-unsend"),
]
