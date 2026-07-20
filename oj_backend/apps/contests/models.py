from django.conf import settings
from django.db import models
from django.utils import timezone


class Contest(models.Model):
    class RuleType(models.TextChoices):
        ACM = "acm", "ACM/ICPC 模式"
        OI = "oi", "OI 模式"

    class Visibility(models.TextChoices):
        PUBLIC = "public", "公开"
        PRIVATE = "private", "私有（指定用户）"
        CLASS = "class", "指定班级"
        PASSWORD = "password", "密码报名"

    title = models.CharField("名称", max_length=255)
    description = models.TextField("简介(Markdown)", blank=True, default="")
    start_time = models.DateTimeField("开始时间")
    end_time = models.DateTimeField("结束时间")

    rule_type = models.CharField(max_length=8, choices=RuleType.choices, default=RuleType.ACM)
    visibility = models.CharField(max_length=16, choices=Visibility.choices, default=Visibility.PUBLIC)
    password = models.CharField(max_length=128, blank=True, default="")
    classroom = models.ForeignKey("classes.ClassRoom", on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name="contests")

    penalty_minutes = models.PositiveIntegerField("每次错误提交罚时(分钟)", default=20)
    freeze_minutes = models.PositiveIntegerField("结束前封榜(分钟)", default=0)

    # 赛中隐藏成绩与榜单（默认关）。开启后：竞赛进行中普通选手提交只显示“已提交”，
    # 看不到评测结果与成绩，排行榜也仅创建者/管理员可见；竞赛结束后自动公开。
    # 见 submissions.models.Submission.results_sealed_for 与 contests.views 排行榜接口。
    hide_results_during_contest = models.BooleanField("赛中隐藏成绩与榜单", default=False)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="created_contests")
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_started(self):
        return timezone.now() >= self.start_time

    @property
    def is_ended(self):
        return timezone.now() > self.end_time

    @property
    def is_running(self):
        return self.is_started and not self.is_ended

    def __str__(self):
        return self.title


class ContestProblem(models.Model):
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name="contest_problems")
    problem = models.ForeignKey("problems.Problem", on_delete=models.CASCADE)
    label = models.CharField("展示序号(A/B/C)", max_length=8)
    score = models.PositiveIntegerField("分值", default=100)

    class Meta:
        ordering = ["label"]
        unique_together = ("contest", "problem")


class ContestParticipant(models.Model):
    contest = models.ForeignKey(Contest, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    registered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("contest", "user")
