from django.contrib import admin

from .models import Contest, ContestParticipant, ContestProblem


class ContestProblemInline(admin.TabularInline):
    model = ContestProblem
    extra = 0


@admin.register(Contest)
class ContestAdmin(admin.ModelAdmin):
    list_display = ("title", "rule_type", "visibility", "start_time", "end_time")
    list_filter = ("rule_type", "visibility")
    inlines = [ContestProblemInline]


admin.site.register(ContestParticipant)
