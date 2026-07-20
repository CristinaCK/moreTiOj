from django.conf import settings
from django.db import models


class Solution(models.Model):
    """
    题解：发布前提是作者已 AC 该题（在视图层校验），
    需管理员审核通过才可见；被驳回可修改后重新提交（回到 pending）。
    """
    class AuditStatus(models.TextChoices):
        PENDING = "pending", "待审核"
        PUBLISHED = "published", "已发布"
        REJECTED = "rejected", "已驳回"

    problem = models.ForeignKey("problems.Problem", on_delete=models.CASCADE, related_name="solutions")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="solutions")
    title = models.CharField("标题", max_length=255)
    content = models.TextField("正文(Markdown)")
    language = models.CharField("语言", max_length=16, blank=True, default="")

    audit_status = models.CharField(max_length=16, choices=AuditStatus.choices, default=AuditStatus.PENDING)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="reviewed_solutions")
    reject_reason = models.CharField("驳回理由", max_length=512, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.problem.display_id} - {self.title}"
