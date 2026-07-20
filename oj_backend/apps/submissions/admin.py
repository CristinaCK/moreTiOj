from django.contrib import admin

from .models import Submission, SubmissionTestResult


class TestResultInline(admin.TabularInline):
    model = SubmissionTestResult
    extra = 0
    readonly_fields = ("index", "status", "time_used", "memory_used", "score")


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "problem", "language", "status",
                    "score", "first_failed_index", "created_at")
    list_filter = ("status", "language")
    inlines = [TestResultInline]
