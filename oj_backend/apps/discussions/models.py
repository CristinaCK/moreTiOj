from django.conf import settings
from django.db import models


class AuditStatus(models.TextChoices):
    PENDING = "pending", "待审核"
    PUBLISHED = "published", "已发布"
    REJECTED = "rejected", "已驳回"


class Discussion(models.Model):
    problem = models.ForeignKey("problems.Problem", on_delete=models.CASCADE,
                                null=True, blank=True, related_name="discussions")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="discussions")
    title = models.CharField("标题", max_length=255)
    content = models.TextField("正文(Markdown)")
    category = models.CharField("分类", max_length=64, blank=True, default="")
    # 默认先发后审；后台可改为先审后发
    audit_status = models.CharField(max_length=16, choices=AuditStatus.choices, default=AuditStatus.PUBLISHED)
    reply_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class DiscussionReply(models.Model):
    """楼层回复，支持二级（父回复）。"""
    discussion = models.ForeignKey(Discussion, on_delete=models.CASCADE, related_name="replies")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="children")
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
