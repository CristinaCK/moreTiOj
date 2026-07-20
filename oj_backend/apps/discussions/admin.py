from django.contrib import admin

from .models import Discussion, DiscussionReply


@admin.register(Discussion)
class DiscussionAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "category", "audit_status", "reply_count", "created_at")
    list_filter = ("audit_status",)
    search_fields = ("title",)


admin.site.register(DiscussionReply)
