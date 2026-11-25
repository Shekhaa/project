from django.core.management.base import BaseCommand
from accounts.models import User


class Command(BaseCommand):
    help = "Permanently purges user accounts whose 14-day deletion retention period has expired."

    def handle(self, *args, **options):
        purged = User.purge_expired_deletions()
        self.stdout.write(self.style.SUCCESS(f"Purged {purged} expired account(s)."))
