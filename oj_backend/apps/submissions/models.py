from django.conf import settings
from django.db import models

from apps.judge.constants import Verdict


class Submission(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submissions")
    problem = models.ForeignKey("problems.Problem", on_delete=models.CASCADE, related_name="submissions")
    contest = models.ForeignKey("contests.Contest", on_delete=models.SET_NULL, null=True, blank=True, related_name="submissions")

    language = models.CharField(max_length=16)
    code = models.TextField()
    cloze_answers = models.JSONField("填空答案", default=dict, blank=True)

    status = models.CharField(max_length=8, choices=Verdict.choices, default=Verdict.PENDING)
    score = models.PositiveIntegerField(default=0)            # OI 模式得分
    time_used = models.PositiveIntegerField(default=0)        # ms，最大测试点
    memory_used = models.PositiveIntegerField(default=0)      # KB，最大测试点
    compile_error = models.TextField(blank=True, default="")

    # ★ 第一个未通过的测试点序号（满足“给出哪个测试点没过”的需求）；全部通过为 null
    first_failed_index = models.IntegerField(null=True, blank=True)

    # 竞赛代码是否公开（仅竞赛结束后对他人生效，见 can_be_viewed_by）
    is_public = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "problem"]), models.Index(fields=["status"])]

    def can_be_viewed_by(self, user):
        if not user.is_authenticated:
            return False
        if user == self.user or user.is_admin:
            return True
        # 他人代码：仅当属于「已结束竞赛」、且作者在个人设置里选择了公开
        if self.contest_id and self.contest.is_ended and self.user.publicize_contest_code:
            return True
        return False

    def results_sealed_for(self, user):
        """
        竞赛进行中是否对该用户封存判题结果（评测状态/得分/测试点/编译信息）。
        仅当该竞赛开启了「赛中隐藏成绩与榜单」开关时才生效（默认关）。
        规则：
          · 非竞赛提交、或该竞赛未开启开关：从不封存；
          · 竞赛已结束：自动解封（所有人可见）；
          · 竞赛进行中：管理员、赛事创建者可见全部；普通参赛者（含作者本人）一律封存，
            只知道“已提交”，看不到自己的成绩，避免赛中泄露、保证考试公平。
        """
        if not self.contest_id:
            return False
        contest = self.contest
        if not contest.hide_results_during_contest:
            return False
        if contest.is_ended:
            return False
        if user is None or not getattr(user, "is_authenticated", False):
            return True
        if user.is_admin or contest.created_by_id == user.id:
            return False
        return True

    def __str__(self):
        return f"#{self.id} {self.user_id} -> {self.problem_id} [{self.status}]"


class SubmissionTestResult(models.Model):
    """每个测试点的判题结果。"""

    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="test_results")
    index = models.PositiveIntegerField()
    status = models.CharField(max_length=8, choices=Verdict.choices)
    time_used = models.PositiveIntegerField(default=0)   # ms
    memory_used = models.PositiveIntegerField(default=0) # KB
    score = models.PositiveIntegerField(default=0)
    group = models.PositiveIntegerField(default=0)

    # 该测试点是否为样例/可见。隐藏测试点的输入输出仅管理员可见（见序列化器）。
    is_sample = models.BooleanField(default=False)

    # 仅当该测试点为样例/可见时才有意义（隐藏测试点不回显数据）
    input_preview = models.TextField(blank=True, default="")
    expected_output = models.TextField(blank=True, default="")
    actual_output = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["index"]

    def __str__(self):
        return f"sub#{self.submission_id} case#{self.index} [{self.status}]"
