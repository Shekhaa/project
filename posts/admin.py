from django.contrib import admin
from .models import Post, PostImage, PostLike, Comment
# 8Bg31pJQdUsobCHfPaMGWtuxlKOqD0zhiVE2AF9cI57TyYr6NZjveB5tTumwYEQGzXgoxlHFyrA0h28W
class PostImageInline(admin.TabularInline):
    model = PostImage
    extra = 1

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "community", "is_anonymous", "anonymous_alias", "is_deleted", "created_at")
    list_filter = ("community", "is_anonymous", "is_deleted", "created_at")
    search_fields = ("author__email", "content", "anonymous_alias")
    inlines = [PostImageInline]

@admin.register(PostLike)
class PostLikeAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "created_at")

@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "is_anonymous", "parent", "created_at")
    list_filter = ("is_anonymous", "created_at")
    search_fields = ("text", "user__email")
