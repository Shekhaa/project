"""
ASGI config for social_network project.
Ready for WebSocket and asynchronous communications (Chat & WebRTC signaling).
"""
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'social_network.settings')
application = get_asgi_application()
