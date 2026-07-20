from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        SYSTEM = "system", "系统公告"
        AUDIT = "audit", "审核结果"
        CONTEST = "contest", "竞赛通知"
        CLASS = "class", "班级通知"
        REPLY = "reply", "回复提醒"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=16, choices=Type.choices, default=Type.SYSTEM)
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default="")
    link = models.CharField("跳转链接", max_length=512, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "is_read"])]


class Announcement(models.Model):
    title = models.CharField(max_length=255)
    content = models.TextField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="announcements")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
