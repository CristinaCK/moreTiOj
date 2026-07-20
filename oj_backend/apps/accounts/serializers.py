from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ("id", "username", "email", "password")

    def create(self, validated_data):
        user = User(
            username=validated_data["username"],
            email=validated_data["email"],
            email_verified=False,
        )
        user.set_password(validated_data["password"])
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    is_teacher = serializers.BooleanField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)
    effective_permissions = serializers.ListField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "username", "real_name", "email", "role", "email_verified",
            "avatar", "bio", "default_language", "publicize_contest_code",
            "accepted_count", "submission_count",
            "is_teacher", "is_admin", "effective_permissions", "date_joined",
        )
        read_only_fields = (
            "role", "real_name", "email_verified", "accepted_count",
            "submission_count", "date_joined",
        )


class AdminUserSerializer(serializers.ModelSerializer):
    """管理后台用户管理：可改角色与额外权限。"""

    is_admin = serializers.BooleanField(read_only=True)
    effective_permissions = serializers.ListField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "username", "real_name", "email", "role", "email_verified", "is_active",
            "granted_permissions", "effective_permissions", "is_admin",
            "accepted_count", "submission_count", "date_joined",
        )
        read_only_fields = (
            "username", "email", "email_verified",
            "accepted_count", "submission_count", "date_joined",
        )

    def validate_granted_permissions(self, value):
        from .perms import ALL_PERMISSION_KEYS

        if not isinstance(value, list):
            raise serializers.ValidationError("权限必须是列表")
        invalid = [k for k in value if k not in ALL_PERMISSION_KEYS]
        if invalid:
            raise serializers.ValidationError(f"未知权限：{', '.join(invalid)}")
        # 去重并按目录顺序
        return [k for k in ALL_PERMISSION_KEYS if k in set(value)]

    def validate_role(self, value):
        if value not in dict(User.Role.choices):
            raise serializers.ValidationError("非法角色")
        return value


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """管理员创建账号（单个）。账号即时可用（email_verified=True）。"""

    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ("id", "username", "real_name", "email", "role", "password")

    def validate_username(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("用户名不能为空")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("用户名已存在")
        return value

    def validate_email(self, value):
        # 邮箱可选；空串归一为 None，避免唯一约束冲突
        if not value:
            return None
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("邮箱已被占用")
        return value

    def validate_role(self, value):
        if value not in dict(User.Role.choices):
            raise serializers.ValidationError("非法角色")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(email_verified=True, **validated_data)
        # 管理员角色顺带具备后台与超级用户能力
        if user.role == User.Role.ADMIN:
            user.is_staff = True
            user.is_superuser = True
        user.set_password(password)
        user.save()
        return user


class AdminSetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=4)


class RankingSerializer(serializers.ModelSerializer):
    """全站排行榜条目。"""

    class Meta:
        model = User
        fields = ("id", "username", "real_name", "avatar", "bio", "accepted_count", "submission_count")


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(validators=[validate_password])
