from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from apps.permissions import CanReviewSolution
from apps.submissions.models import Submission

from .models import Solution
from .serializers import (
    SolutionCreateSerializer,
    SolutionDetailSerializer,
    SolutionListSerializer,
    SolutionRejectSerializer,
    SolutionUpdateSerializer,
)


class SolutionViewSet(viewsets.ModelViewSet):
    """
    题解：发布前提是已 AC 该题；先进入待审核，管理员通过后对外可见；
    被驳回可修改后重新提交（自动回到待审核）。
    """
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        qs = Solution.objects.select_related("problem", "author")
        can_review = user.is_authenticated and (user.is_admin or user.has_perm_key("review_solution"))
        if can_review:
            visible = qs
        elif user.is_authenticated:
            # 已发布的 + 自己的（含待审核/被驳回，便于查看状态）
            visible = qs.filter(Q(audit_status=Solution.AuditStatus.PUBLISHED) | Q(author=user))
        else:
            visible = qs.filter(audit_status=Solution.AuditStatus.PUBLISHED)

        params = self.request.query_params
        if params.get("mine") == "1" and user.is_authenticated:
            visible = visible.filter(author=user)
        st = params.get("status")
        if st and user.is_authenticated and (can_review or params.get("mine") == "1"):
            visible = visible.filter(audit_status=st)
        problem = params.get("problem")
        if problem:
            visible = visible.filter(problem__display_id=problem)
        return visible.order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return SolutionCreateSerializer
        if self.action in ("update", "partial_update"):
            return SolutionUpdateSerializer
        if self.action == "retrieve":
            return SolutionDetailSerializer
        return SolutionListSerializer

    def perform_create(self, serializer):
        user = self.request.user
        problem = serializer.validated_data["problem"]
        # ★ AC 前置：必须已通过该题
        if not Submission.objects.filter(user=user, problem=problem, status="accepted").exists():
            raise ValidationError("需先通过该题（AC）后才能发布题解")
        serializer.save(author=user, audit_status=Solution.AuditStatus.PENDING)

    def update(self, request, *args, **kwargs):
        solution = self.get_object()
        if solution.author_id != request.user.id:
            return Response({"detail": "仅作者可修改"}, status=status.HTTP_403_FORBIDDEN)
        partial = kwargs.pop("partial", False)
        serializer = SolutionUpdateSerializer(solution, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        # ★ 任何修改都回到待审核（覆盖「驳回后修改重投」场景）
        serializer.save(audit_status=Solution.AuditStatus.PENDING, published_at=None)
        return Response(
            SolutionDetailSerializer(solution, context=self.get_serializer_context()).data
        )

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.author_id != user.id and not user.is_admin:
            raise PermissionDenied("仅作者或管理员可删除")
        instance.delete()

    @action(detail=True, methods=["post"], permission_classes=[CanReviewSolution])
    def approve(self, request, pk=None):
        solution = self.get_object()
        solution.audit_status = Solution.AuditStatus.PUBLISHED
        solution.reviewer = request.user
        solution.reject_reason = ""
        solution.published_at = timezone.now()
        solution.save(update_fields=["audit_status", "reviewer", "reject_reason", "published_at"])
        create_notification(
            solution.author, Notification.Type.AUDIT,
            title=f"题解审核通过：{solution.title}",
            link=f"/problems/{solution.problem.display_id}/solutions/{solution.id}",
        )
        return Response({"detail": "已通过"})

    @action(detail=True, methods=["post"], permission_classes=[CanReviewSolution])
    def reject(self, request, pk=None):
        s = SolutionRejectSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        reason = s.validated_data.get("reason", "")
        solution = self.get_object()
        solution.audit_status = Solution.AuditStatus.REJECTED
        solution.reviewer = request.user
        solution.reject_reason = reason
        solution.published_at = None
        solution.save(update_fields=["audit_status", "reviewer", "reject_reason", "published_at"])
        create_notification(
            solution.author, Notification.Type.AUDIT,
            title=f"题解被驳回：{solution.title}",
            content=(f"驳回理由：{reason}。" if reason else "") + "你可以修改后重新提交审核。",
        )
        return Response({"detail": "已驳回"})
