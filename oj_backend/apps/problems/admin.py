from django.contrib import admin

from .models import Problem, Tag, TestCase


class TestCaseInline(admin.TabularInline):
    model = TestCase
    extra = 0


@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ("display_id", "title", "difficulty", "visibility",
                    "spj_enabled", "accepted_count", "total_submit")
    list_filter = ("difficulty", "visibility", "spj_enabled")
    search_fields = ("display_id", "title")
    filter_horizontal = ("tags",)
    inlines = [TestCaseInline]


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    search_fields = ("name",)


@admin.register(TestCase)
class TestCaseAdmin(admin.ModelAdmin):
    list_display = ("problem", "index", "score", "is_sample")
    list_filter = ("is_sample",)
