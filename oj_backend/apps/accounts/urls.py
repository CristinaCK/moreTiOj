from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

# 账号由管理员统一创建；自助注册、邮箱验证、自助找回/重置密码已关闭（需求 5）。
router = DefaultRouter()
router.register("admin/users", views.AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("admin/permissions/", views.AdminPermissionCatalogView.as_view(), name="admin-permissions"),
] + router.urls
