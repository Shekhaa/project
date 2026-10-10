from django import forms
from .models import Post, Comment

class PostCreateForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ['content', 'image']
        widgets = {
            'content': forms.Textarea(attrs={
                'rows': 3,
                'class': 'w-full bg-transparent text-white placeholder-gray-400 border-none focus:ring-0 focus:outline-none resize-none text-lg',
                'placeholder': "What's on your mind?"
            }),
            'image': forms.FileInput(attrs={
                'class': 'hidden',
                'id': 'post-image-input',
                'accept': 'image/*'
            }),
        }


class CommentForm(forms.ModelForm):
    class Meta:
        model = Comment
        fields = ['content']
        widgets = {
            'content': forms.TextInput(attrs={
                'class': 'w-full bg-gray-800 text-white placeholder-gray-400 rounded-full px-4 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500',
                'placeholder': 'Add a comment...'
            }),
        }
