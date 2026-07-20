import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """系统用户。角色决定权限：学生 / 教师 / 管理员。"""

    class Role(models.TextChoices):
        USER = "user", "学生/普通用户"
        TEACHER = "teacher", "教师"
        ADMIN = "admin", "管理员"

    email = models.EmailField("邮箱", unique=True, null=True, blank=True)
    real_name = models.CharField("真实姓名", max_length=64, blank=True, default="")
    role = models.CharField("角色", max_length=16, choices=Role.choices, default=Role.USER)
    email_verified = models.BooleanField("邮箱已验证", default=False)

    avatar = models.URLField("头像", blank=True, default="")
    bio = models.CharField("简介", max_length=255, blank=True, default="")
    default_language = models.CharField("默认语言", max_length=16, default="cpp")

    # 竞赛结束后是否默认公开本人代码（用户可在做题/提交层面再单独设置）
    publicize_contest_code = models.BooleanField("默认公开竞赛代码", default=False)

    # 缓存统计（异步更新即可，避免实时聚合）
    accepted_count = models.PositiveIntegerField("AC 题数", default=0)
    submission_count = models.PositiveIntegerField("提交数", default=0)

    # 由管理员逐项开关授予的细粒度权限（key 列表，见 apps/accounts/perms.py）
    granted_permissions = models.JSONField("额外权限", default=list, blank=True)

    @property
    def is_teacher(self):
        return self.role in (self.Role.TEACHER, self.Role.ADMIN) or self.is_superuser

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def effective_permissions(self):
        """角色基线 ∪ 额外授予；管理员拥有全部。"""
        from .perms import ALL_PERMISSION_KEYS, ROLE_BASE_PERMS

        if self.is_admin:
            return list(ALL_PERMISSION_KEYS)
        base = ROLE_BASE_PERMS.get(self.role, [])
        granted = self.granted_permissions or []
        # 仅保留合法 key，并保持目录顺序
        valid = set(base) | set(granted)
        return [k for k in ALL_PERMISSION_KEYS if k in valid]

    def has_perm_key(self, key):
        return self.is_admin or key in self.effective_permissions

    @property
    def display_name(self):
        """用于竞赛/排名展示：优先真实姓名，回退用户名。"""
        return self.real_name or self.username

    def __str__(self):
        return self.username


class EmailToken(models.Model):
    """邮箱验证 / 找回密码的一次性令牌。"""

    class Purpose(models.TextChoices):
        VERIFY = "verify", "邮箱验证"
        RESET = "reset", "重置密码"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_tokens")
    purpose = models.CharField(max_length=16, choices=Purpose.choices)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def issue(cls, user, purpose, ttl_minutes=60):
        return cls.objects.create(
            user=user,
            purpose=purpose,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(minutes=ttl_minutes),
        )

    @property
    def is_valid(self):
        return (not self.used) and timezone.now() < self.expires_at
