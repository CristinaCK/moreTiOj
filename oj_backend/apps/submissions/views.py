from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from apps.judge.runner import run_custom

from .models import Submission
from .serializers import (
    SubmissionCreateSerializer,
    SubmissionDetailSerializer,
    SubmissionListSerializer,
)
from .tasks import judge_submission


class SubmissionViewSet(mixins.CreateModelMixin,
                        mixins.RetrieveModelMixin,
                        mixins.ListModelMixin,
                        viewsets.GenericViewSet):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        """列表可见范围：
        · 明确 mine=1：只看自己的（所有人一致，供「我的提交」面板使用）。
        · 管理员：看全部（可按 username / problem / contest / status 过滤）。
        · 竞赛创建者：可看自己创建的竞赛（contest=<id>）内的全部提交。
        · 其余登录用户：只看自己的。
        """
        user = self.request.user
        qs = Submission.objects.select_related("user", "problem", "contest")
        p = self.request.query_params
        if p.get("problem"):
            qs = qs.filter(problem__display_id=p["problem"])
        if p.get("username"):
            qs = qs.filter(user__username=p["username"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        cid = p.get("contest")
        if cid and str(cid).isdigit():
            qs = qs.filter(contest_id=int(cid))

        if p.get("mine") and user.is_authenticated:
            return qs.filter(user=user)
        if user.is_authenticated and user.is_admin:
            return qs
        if cid and str(cid).isdigit() and user.is_authenticated:
            from apps.contests.models import Contest
            if Contest.objects.filter(id=int(cid), created_by=user).exists():
                return qs
        if user.is_authenticated:
            return qs.filter(user=user)
        return qs.none()

    def get_object(self):
        """详情可见：本人 / 管理员 / 该竞赛创建者 / 赛后作者公开的代码；其余 404。"""
        from django.http import Http404
        from django.shortcuts import get_object_or_404

        obj = get_object_or_404(
            Submission.objects.select_related("user", "problem", "contest"),
            pk=self.kwargs.get("pk"),
        )
        user = self.request.user
        if not user.is_authenticated:
            raise Http404
        if (user.is_admin
                or obj.user_id == user.id
                or (obj.contest_id and obj.contest.created_by_id == user.id)
                or obj.can_be_viewed_by(user)):
            return obj
        raise Http404

    def get_serializer_class(self):
        if self.action == "create":
            return SubmissionCreateSerializer
        if self.action == "retrieve":
            return SubmissionDetailSerializer
        return SubmissionListSerializer

    def create(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return Response({"detail": "请先登录"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = serializer.save(user=request.user, status="pending")
        # 入队异步判题
        judge_submission.delay(submission.id)
        return Response(
            SubmissionDetailSerializer(submission, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def retrieve(self, request, *args, **kwargs):
        submission = self.get_object()
        # 列表字段可见，但源代码是否返回由序列化器按权限决定
        serializer = SubmissionDetailSerializer(submission, context=self.get_serializer_context())
        return Response(serializer.data)

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated])
    def run(self, request):
        """在线运行：对自定义输入运行一次，同步返回结果（不评测、不计入提交记录）。
        请求体：{language, code, stdin}。"""
        language = request.data.get("language", "")
        code = request.data.get("code", "")
        stdin = request.data.get("stdin", "")
        if not code or not code.strip():
            return Response({"detail": "代码不能为空"}, status=status.HTTP_400_BAD_REQUEST)
        if len(code) > 64 * 1024:
            return Response({"detail": "代码过长"}, status=status.HTTP_400_BAD_REQUEST)
        if len(stdin) > 64 * 1024:
            return Response({"detail": "输入过长（上限 64KB）"}, status=status.HTTP_400_BAD_REQUEST)
        result = run_custom(code, language, stdin)
        return Response(result)
