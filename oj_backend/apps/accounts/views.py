from django.conf import settings
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.permissions import IsAdmin

from .models import EmailToken, User
from .perms import PERMISSION_CATALOG
from .serializers import (
    AdminSetPasswordSerializer,
    AdminUserCreateSerializer,
    AdminUserSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RankingSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .tasks import send_email_task


def _send_token_email(user, token: EmailToken):
    """发送验证 / 重置邮件（异步）。开发环境 console 后端会直接打印。"""
    if token.purpose == EmailToken.Purpose.VERIFY:
        link = f"{settings.FRONTEND_URL}/verify-email?token={token.token}"
        subject = "【OJ】请验证你的邮箱"
        body = f"你好 {user.username}，请点击以下链接完成邮箱验证（1 小时内有效）：\n{link}"
    else:
        link = f"{settings.FRONTEND_URL}/reset-password?token={token.token}"
        subject = "【OJ】重置密码"
        body = f"你好 {user.username}，请点击以下链接重置密码（1 小时内有效）：\n{link}"
    send_email_task.delay(subject, body, user.email)


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        token = EmailToken.issue(user, EmailToken.Purpose.VERIFY)
        _send_token_email(user, token)


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        token_str = request.data.get("token", "")
        token = EmailToken.objects.filter(
            token=token_str, purpose=EmailToken.Purpose.VERIFY
        ).first()
        if not token or not token.is_valid:
            return Response({"detail": "验证链接无效或已过期"}, status=status.HTTP_400_BAD_REQUEST)
        user = token.user
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        token.used = True
        token.save(update_fields=["used"])
        return Response({"detail": "邮箱验证成功"})


class VerifiedTokenObtainSerializer(TokenObtainPairSerializer):
    """登录时要求邮箱已验证。"""

    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.email_verified:
            from rest_framework.exceptions import AuthenticationFailed
            raise AuthenticationFailed("邮箱未验证，请先完成邮箱验证")
        data["user"] = UserSerializer(self.user).data
        return data


class LoginView(TokenObtainPairView):
    serializer_class = VerifiedTokenObtainSerializer


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"]).first()
        if user:
            token = EmailToken.issue(user, EmailToken.Purpose.RESET)
            _send_token_email(user, token)
        # 无论邮箱是否存在都返回成功，避免邮箱枚举
        return Response({"detail": "若邮箱存在，重置邮件已发送"})


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = EmailToken.objects.filter(
            token=serializer.validated_data["token"],
            purpose=EmailToken.Purpose.RESET,
        ).first()
        if not token or not token.is_valid:
            return Response({"detail": "重置链接无效或已过期"}, status=status.HTTP_400_BAD_REQUEST)
        user = token.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        token.used = True
        token.save(update_fields=["used"])
        return Response({"detail": "密码重置成功"})


class RankingView(generics.ListAPIView):
    """全站排行榜：按 AC 题数降序、提交数升序（不使用 Rating）。"""

    serializer_class = RankingSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return User.objects.filter(is_active=True).order_by(
            "-accepted_count", "submission_count", "id"
        )


# ============ 管理后台（仅管理员） ============

class AdminUserViewSet(viewsets.ModelViewSet):
    """用户管理：列表/搜索、创建（含批量）、修改角色与权限、重置密码。仅管理员。"""

    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return AdminUserCreateSerializer
        return AdminUserSerializer

    def get_queryset(self):
        qs = User.objects.all().order_by("id")
        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(real_name__icontains=search)
                | Q(email__icontains=search)
            )
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(AdminUserSerializer(user).data, status=status.HTTP_201_CREATED)


    @action(detail=False, methods=["post"], url_path="batch")
    def batch(self, request):
        """批量创建账号。请求体：{"users": [{username, password, real_name?, role?}, ...]}。
        逐条创建，返回成功与失败明细（失败不影响其他条目）。"""
        rows = request.data.get("users")
        if not isinstance(rows, list) or not rows:
            return Response({"detail": "users 必须为非空列表"}, status=status.HTTP_400_BAD_REQUEST)
        created, errors = [], []
        for i, row in enumerate(rows):
            s = AdminUserCreateSerializer(data=row)
            if s.is_valid():
                u = s.save()
                created.append({"username": u.username, "real_name": u.real_name})
            else:
                errors.append({"row": i + 1, "username": row.get("username", ""), "errors": s.errors})
        return Response({"created_count": len(created), "created": created, "errors": errors})

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        s = AdminSetPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user.set_password(s.validated_data["password"])
        user.save(update_fields=["password"])
        return Response({"detail": f"已为 {user.username} 设置新密码"})


class AdminPermissionCatalogView(APIView):
    """返回可授予的权限目录，供后台渲染开关。"""

    permission_classes = [IsAdmin]

    def get(self, request):
        return Response([{"key": k, "label": label} for k, label in PERMISSION_CATALOG])
