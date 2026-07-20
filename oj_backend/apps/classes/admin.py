from django.contrib import admin

from .models import Assignment, ClassMember, ClassRoom


class ClassMemberInline(admin.TabularInline):
    model = ClassMember
    extra = 0


@admin.register(ClassRoom)
class ClassRoomAdmin(admin.ModelAdmin):
    list_display = ("name", "teacher", "invite_code", "created_at")
    inlines = [ClassMemberInline]


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("title", "classroom", "due_at")
    filter_horizontal = ("problems",)
