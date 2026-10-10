from django import forms
from django.contrib.auth.models import User
from .models import Profile

class UserRegisterForm(forms.ModelForm):
    password = forms.CharField(widget=forms.PasswordInput(attrs={
        'class': 'w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition',
        'placeholder': 'Enter your password'
    }))
    confirm_password = forms.CharField(widget=forms.PasswordInput(attrs={
        'class': 'w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition',
        'placeholder': 'Confirm your password'
    }))

    class Meta:
        model = User
        fields = ['username', 'first_name', 'last_name', 'email', 'password']
        widgets = {
            'username': forms.TextInput(attrs={
                'class': 'w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition',
                'placeholder': 'Choose a username'
            }),
            'first_name': forms.TextInput(attrs={
                'class': 'w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition',
                'placeholder': 'First Name'
            }),
            'last_name': forms.TextInput(attrs={
                'class': 'w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition',
                'placeholder': 'Last Name'
            }),
            'email': forms.EmailInput(attrs={
                'class': 'w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition',
                'placeholder': 'Email address'
            }),
        }

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get('password')
        confirm_password = cleaned_data.get('confirm_password')

        if password and confirm_password and password != confirm_password:
            self.add_error('confirm_password', "Passwords do not match!")
        return cleaned_data


class UserUpdateForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']
        widgets = {
            'first_name': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500'
            }),
            'last_name': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500'
            }),
            'email': forms.EmailInput(attrs={
                'class': 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500'
            }),
        }


class ProfileUpdateForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ['avatar', 'cover_image', 'bio', 'location', 'website']
        widgets = {
            'bio': forms.Textarea(attrs={
                'rows': 3,
                'class': 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500',
                'placeholder': 'Write something about yourself...'
            }),
            'location': forms.TextInput(attrs={
                'class': 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500',
                'placeholder': 'City, Country'
            }),
            'website': forms.URLInput(attrs={
                'class': 'w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500',
                'placeholder': 'https://yourwebsite.com'
            }),
            'avatar': forms.FileInput(attrs={
                'class': 'block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700'
            }),
            'cover_image': forms.FileInput(attrs={
                'class': 'block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700'
            }),
        }
