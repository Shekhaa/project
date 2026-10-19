from django.db import models
from django.conf import settings
from communities.models import Community

class Post(models.Model):
    community = models.ForeignKey(
        Community,
        on_delete=models.CASCADE,
        related_name="posts"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts"
    )
    content = models.TextField(max_length=5000, blank=True)
    media_type = models.CharField(
        max_length=20,
        choices=[
            ("TEXT", "Text Only"),
            ("IMAGE", "Image / Photo"),
            ("VIDEO", "Video / Reel"),
            ("DOCUMENT", "PDF / Document"),
        ],
        default="TEXT"
    )
    media_url = models.TextField(blank=True, default="", help_text="Direct URL or media data path")
    document = models.FileField(upload_to="post_documents/", null=True, blank=True)
    document_name = models.CharField(max_length=255, blank=True, default="")
    document_size = models.CharField(max_length=50, blank=True, default="")
    is_anonymous = models.BooleanField(default=False)
    anonymous_alias = models.CharField(max_length=50, blank=True, default="")
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["community", "-created_at"], name="post_community_created_idx"),
            models.Index(fields=["is_deleted", "-created_at"], name="post_deleted_created_idx"),
            models.Index(fields=["author", "-created_at"], name="post_author_created_idx"),
        ]

    def __str__(self):
        display_author = self.anonymous_alias if self.is_anonymous else self.author.email
        return f"{display_author} - {self.community.name} ({self.created_at:%Y-%m-%d %H:%M})"


class PostImage(models.Model):
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="images"
    )
    image = models.ImageField(upload_to="post_images/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self):
        return f"Image for Post #{self.post.id}"


class PostLike(models.Model):
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="likes"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="liked_posts"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "user"], name="unique_post_like")
        ]
        indexes = [
            models.Index(fields=["post", "-created_at"], name="postlike_post_created_idx"),
        ]

    def __str__(self):
        return f"{self.user.email} liked Post #{self.post.id}"


class Comment(models.Model):
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="comments"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comments"
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies"
    )
    text = models.TextField()
    is_anonymous = models.BooleanField(default=False)
    anonymous_alias = models.CharField(max_length=50, blank=True, default="")
    is_edited = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["post", "created_at"], name="comment_post_created_idx"),
        ]

    def __str__(self):
        return f"Comment by {self.user.email} on Post #{self.post.id}"
