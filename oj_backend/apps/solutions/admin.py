from django.contrib import admin

from .models import Solution


@admin.register(Solution)
class SolutionAdmin(admin.ModelAdmin):
    list_display = ("title", "problem", "author", "audit_status", "created_at")
    list_filter = ("audit_status",)
    actions = ["approve", "reject"]

    @admin.action(description="通过所选题解")
    def approve(self, request, queryset):
        from django.utils import timezone
        queryset.update(audit_status="published", reviewer=request.user, published_at=timezone.now())

    @admin.action(description="驳回所选题解")
    def reject(self, request, queryset):
        queryset.update(audit_status="rejected", reviewer=request.user)
