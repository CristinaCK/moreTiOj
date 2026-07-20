import secrets

from django.conf import settings
from django.db import models


def gen_invite_code():
    return secrets.token_urlsafe(6)


class ClassRoom(models.Model):
    name = models.CharField("班级名称", max_length=128)
    description = models.CharField("简介", max_length=255, blank=True, default="")
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="owned_classes")
    invite_code = models.CharField("邀请码", max_length=32, unique=True, default=gen_invite_code)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ClassMember(models.Model):
    class MemberRole(models.TextChoices):
        STUDENT = "student", "学生"
        ASSISTANT = "assistant", "助教"

    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="class_memberships")
    role = models.CharField(max_length=16, choices=MemberRole.choices, default=MemberRole.STUDENT)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("classroom", "user")


class Assignment(models.Model):
    """作业 = 绑定班级、带截止时间的题目集合。"""
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField("作业标题", max_length=255)
    problems = models.ManyToManyField("problems.Problem", related_name="assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)
    due_at = models.DateTimeField("截止时间", null=True, blank=True)

    def __str__(self):
        return f"{self.classroom.name} - {self.title}"
