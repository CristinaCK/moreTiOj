from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import EmailToken, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("username", "email", "role", "email_verified", "is_staff")
    list_filter = ("role", "email_verified", "is_staff")
    fieldsets = UserAdmin.fieldsets + (
        ("OJ 字段", {"fields": ("role", "email_verified", "avatar", "bio",
                                "default_language", "publicize_contest_code",
                                "accepted_count", "submission_count")}),
    )


@admin.register(EmailToken)
class EmailTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "used", "expires_at", "created_at")
    list_filter = ("purpose", "used")
