from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from apps.permissions import IsTeacherOrReadOnly

from .leaderboard import compute_leaderboard
from .models import Contest, ContestParticipant, ContestProblem
from .serializers import (
    AddContestProblemSerializer,
    ContestCreateSerializer,
    ContestDetailSerializer,
    ContestListSerializer,
)


class ContestViewSet(viewsets.ModelViewSet):
    """
    竞赛：列表/详情（按可见性过滤）；创建/编辑要求教师；
    自定义动作：报名、添加题目、排行榜。
    """
    permission_classes = [IsTeacherOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        qs = Contest.objects.all().order_by("-start_time")
        if user.is_authenticated and user.is_teacher:
            return qs
        # 公开 / 密码赛对所有人可见；班级赛仅成员；私有仅创建者或已报名
        visible = Q(visibility__in=[Contest.Visibility.PUBLIC, Contest.Visibility.PASSWORD])
        if user.is_authenticated:
            visible |= Q(created_by=user)
            visible |= Q(participants__user=user)
            visible |= Q(visibility=Contest.Visibility.CLASS, classroom__members__user=user)
        return qs.filter(visible).distinct()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ContestCreateSerializer
        if self.action == "retrieve":
            return ContestDetailSerializer
        return ContestListSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        contest = self.get_object()
        if contest.created_by_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "仅创建者或管理员可修改"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        contest = self.get_object()
        if contest.created_by_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "仅创建者或管理员可删除"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def register(self, request, pk=None):
        contest = self.get_object()
        if contest.is_ended:
            return Response({"detail": "竞赛已结束，无法报名"}, status=status.HTTP_400_BAD_REQUEST)

        v = contest.visibility
        if v == Contest.Visibility.PASSWORD:
            if request.data.get("password", "") != contest.password:
                return Response({"detail": "报名密码错误"}, status=status.HTTP_400_BAD_REQUEST)
        elif v == Contest.Visibility.CLASS:
            if not (contest.classroom and contest.classroom.members.filter(user=request.user).exists()):
                return Response({"detail": "仅该班级成员可报名"}, status=status.HTTP_403_FORBIDDEN)
        elif v == Contest.Visibility.PRIVATE:
            return Response({"detail": "私有竞赛需由组织者添加，无法自行报名"}, status=status.HTTP_403_FORBIDDEN)

        _, created = ContestParticipant.objects.get_or_create(contest=contest, user=request.user)
        if created:
            create_notification(
                request.user, Notification.Type.CONTEST,
                title=f"报名成功：{contest.title}",
                link=f"/contests/{contest.id}",
            )
        return Response({"detail": "报名成功" if created else "你已报名"})

    @action(detail=True, methods=["post"], permission_classes=[IsTeacherOrReadOnly])
    def add_participants(self, request, pk=None):
        """私有赛/定向邀请：创建者按用户名批量添加参赛者。{"usernames": ["a","b"]}"""
        contest = self.get_object()
        if contest.created_by_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "仅创建者或管理员可管理参赛名单"}, status=status.HTTP_403_FORBIDDEN)
        usernames = request.data.get("usernames")
        if not isinstance(usernames, list) or not usernames:
            return Response({"detail": "usernames 必须为非空列表"}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth import get_user_model
        found = list(get_user_model().objects.filter(username__in=usernames))
        added, already = [], []
        for u in found:
            _, created = ContestParticipant.objects.get_or_create(contest=contest, user=u)
            if created:
                added.append(u.username)
                create_notification(
                    u, Notification.Type.CONTEST,
                    title=f"你已被添加到竞赛：{contest.title}",
                    link=f"/contests/{contest.id}",
                )
            else:
                already.append(u.username)
        not_found = sorted(set(usernames) - {u.username for u in found})
        return Response({"added": added, "already": already, "not_found": not_found})

    @action(detail=True, methods=["post"], permission_classes=[IsTeacherOrReadOnly])
    def remove_participant(self, request, pk=None):
        """移除参赛者：{"username": "a"}"""
        contest = self.get_object()
        if contest.created_by_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "仅创建者或管理员可管理参赛名单"}, status=status.HTTP_403_FORBIDDEN)
        username = request.data.get("username", "")
        deleted, _ = ContestParticipant.objects.filter(
            contest=contest, user__username=username
        ).delete()
        return Response({"detail": "已移除" if deleted else "该用户不在参赛名单中"})

    @action(detail=True, methods=["post"], permission_classes=[IsTeacherOrReadOnly])
    def add_problem(self, request, pk=None):
        contest = self.get_object()
        if contest.created_by_id != request.user.id and not request.user.is_admin:
            return Response({"detail": "仅创建者或管理员可管理赛题"}, status=status.HTTP_403_FORBIDDEN)
        serializer = AddContestProblemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from apps.problems.models import Problem
        problem = Problem.objects.get(display_id=serializer.validated_data["display_id"])
        cp, created = ContestProblem.objects.update_or_create(
            contest=contest, problem=problem,
            defaults={"label": serializer.validated_data["label"],
                      "score": serializer.validated_data["score"]},
        )
        return Response({"detail": "已添加" if created else "已更新", "label": cp.label})

    @action(detail=True, methods=["get"])
    def leaderboard(self, request, pk=None):
        contest = self.get_object()
        if not contest.is_started:
            return Response({"detail": "竞赛尚未开始"}, status=status.HTTP_400_BAD_REQUEST)
        user = request.user
        is_staff = user.is_authenticated and (user.is_admin or contest.created_by_id == user.id)
        # 仅当该竞赛开启「赛中隐藏成绩与榜单」开关时，进行中才对普通选手关闭榜单，
        # 竞赛结束后再开放；与提交结果的封存口径一致（见 Submission.results_sealed_for）。
        if contest.hide_results_during_contest and contest.is_running and not is_staff:
            return Response(
                {"detail": "本场竞赛设置为赛中隐藏成绩与榜单，排行榜将在竞赛结束后对选手开放。"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # 创建者/管理员不受封榜影响，始终看实时全榜
        return Response(compute_leaderboard(contest, full=is_staff))
