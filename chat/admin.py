from django.contrib import admin
from .models import Conversation, ConversationMember, Message

class ConversationMemberInline(admin.TabularInline):
    model = ConversationMember
    extra = 1

class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ("sender", "text", "attachment", "is_read", "created_at")

@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "is_group", "updated_at", "created_at")
    list_filter = ("is_group", "created_at")
    inlines = [ConversationMemberInline, MessageInline]

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "is_read", "created_at")
    list_filter = ("is_read", "created_at")
    search_fields = ("text", "sender__email")
