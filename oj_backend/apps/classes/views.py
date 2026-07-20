from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.models import Notification
from apps.notifications.services import bulk_notify, create_notification
from apps.problems.models import Problem
from apps.submissions.models import Submission
from apps.submissions.serializers import SubmissionListSerializer

from .models import Assignment, ClassMember, ClassRoom
from .serializers import (
    AssignmentCreateSerializer,
    AssignmentSerializer,
    ClassMemberSerializer,
    ClassRoomCreateSerializer,
    ClassRoomSerializer,
)


def compute_assignment_board(assignment, classroom):
    """计算某次作业的班级排行榜：按解出题数降序、最后一次 AC 时间升序。"""
    problems = list(assignment.problems.all().order_by("display_id"))
    pids = [p.id for p in problems]
    members = list(classroom.members.select_related("user"))
    member_users = {m.user_id: m.user for m in members}

    ac = {}          # (uid, pid) -> 最早 AC 时间
    attempted = set()  # (uid, pid)
    if pids and member_users:
        subs = (
            Submission.objects.filter(user_id__in=member_users.keys(), problem_id__in=pids)
            .values("user_id", "problem_id", "status", "created_at")
            .order_by("created_at")
        )
        for s in subs:
            key = (s["user_id"], s["problem_id"])
            attempted.add(key)
            if s["status"] == "accepted" and key not in ac:
                ac[key] = s["created_at"]

    rows = []
    for uid, u in member_users.items():
        cells, solved, last_ac = {}, 0, None
        for p in problems:
            key = (uid, p.id)
            if key in ac:
                cells[p.display_id] = "solved"
                solved += 1
                if last_ac is None or ac[key] > last_ac:
                    last_ac = ac[key]
            elif key in attempted:
                cells[p.display_id] = "attempted"
            else:
                cells[p.display_id] = "none"
        rows.append({
            "user_id": uid, "user": u.username, "name": u.display_name,
            "solved": solved, "total": len(problems),
            "last_ac": last_ac.isoformat() if last_ac else None,
            "problems": cells,
        })
    rows.sort(key=lambda r: (-r["solved"], r["last_ac"] or "9999"))
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return {
        "assignment": {
            "id": assignment.id, "title": assignment.title,
            "due_at": assignment.due_at.isoformat() if assignment.due_at else None,
        },
        "problems": [{"display_id": p.display_id, "title": p.title} for p in problems],
        "rows": rows,
    }


class ClassRoomViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # 我教的 + 我加入的
        return ClassRoom.objects.filter(
            Q(teacher=user) | Q(members__user=user)
        ).distinct().order_by("-created_at")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ClassRoomCreateSerializer
        return ClassRoomSerializer

    def create(self, request, *args, **kwargs):
        if not request.user.is_teacher:
            return Response({"detail": "仅教师可创建班级"}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = serializer.save(teacher=request.user)
        return Response(
            ClassRoomSerializer(classroom, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        classroom = self.get_object()
        if not self._ensure_teacher(classroom):
            return Response({"detail": "仅班级教师或管理员可修改"}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        classroom = self.get_object()
        if not self._ensure_teacher(classroom):
            return Response({"detail": "仅班级教师或管理员可删除"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def join(self, request):
        code = request.data.get("invite_code", "")
        classroom = ClassRoom.objects.filter(invite_code=code).first()
        if not classroom:
            return Response({"detail": "邀请码无效"}, status=status.HTTP_400_BAD_REQUEST)
        if classroom.teacher_id == request.user.id:
            return Response({"detail": "你是该班级教师，无需加入"}, status=status.HTTP_400_BAD_REQUEST)
        _, created = ClassMember.objects.get_or_create(classroom=classroom, user=request.user)
        if created:
            create_notification(
                request.user, Notification.Type.CLASS,
                title=f"已加入班级：{classroom.name}", link=f"/classes/{classroom.id}",
            )
        return Response(
            {"detail": "加入成功" if created else "你已在该班级",
             "class_id": classroom.id, "name": classroom.name}
        )

    def _ensure_teacher(self, classroom):
        return classroom.teacher_id == self.request.user.id or self.request.user.is_admin

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        classroom = self.get_object()
        if not (self._ensure_teacher(classroom) or classroom.members.filter(user=request.user).exists()):
            return Response({"detail": "无权限"}, status=status.HTTP_403_FORBIDDEN)
        return Response(ClassMemberSerializer(classroom.members.select_related("user"), many=True).data)

    @action(detail=True, methods=["post"])
    def remove_member(self, request, pk=None):
        classroom = self.get_object()
        if not self._ensure_teacher(classroom):
            return Response({"detail": "仅班级教师可移除成员"}, status=status.HTTP_403_FORBIDDEN)
        user_id = request.data.get("user_id")
        deleted, _ = ClassMember.objects.filter(classroom=classroom, user_id=user_id).delete()
        return Response({"detail": "已移除" if deleted else "成员不存在"})

    @action(detail=True, methods=["get", "post"])
    def assignments(self, request, pk=None):
        classroom = self.get_object()
        if request.method == "GET":
            if not (self._ensure_teacher(classroom) or classroom.members.filter(user=request.user).exists()):
                return Response({"detail": "无权限"}, status=status.HTTP_403_FORBIDDEN)
            qs = classroom.assignments.prefetch_related("problems").order_by("-assigned_at")
            return Response(AssignmentSerializer(qs, many=True).data)

        # POST：教师布置作业
        if not self._ensure_teacher(classroom):
            return Response({"detail": "仅班级教师可布置作业"}, status=status.HTTP_403_FORBIDDEN)
        serializer = AssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        assignment = Assignment.objects.create(
            classroom=classroom, title=data["title"], due_at=data.get("due_at")
        )
        problems = Problem.objects.filter(display_id__in=data["problem_display_ids"])
        assignment.problems.set(problems)
        # 通知班级成员
        member_users = [m.user for m in classroom.members.select_related("user")]
        bulk_notify(
            member_users, Notification.Type.CLASS,
            title=f"新作业：{data['title']}", link=f"/classes/{classroom.id}",
        )
        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="add-members")
    def add_members(self, request, pk=None):
        """教师按用户名批量将学生加入班级。{"usernames": ["a", "b", ...]}"""
        classroom = self.get_object()
        if not self._ensure_teacher(classroom):
            return Response({"detail": "仅班级教师可添加成员"}, status=status.HTTP_403_FORBIDDEN)
        usernames = request.data.get("usernames")
        if not isinstance(usernames, list) or not usernames:
            return Response({"detail": "usernames 必须为非空列表"}, status=status.HTTP_400_BAD_REQUEST)
        usernames = [u.strip() for u in usernames if str(u).strip()]
        User = get_user_model()
        found = list(User.objects.filter(username__in=usernames))
        found_names = {u.username for u in found}
        added, already = [], []
        for u in found:
            if u.id == classroom.teacher_id:
                continue
            _, created = ClassMember.objects.get_or_create(classroom=classroom, user=u)
            (added if created else already).append(u.username)
        if added:
            bulk_notify(
                [u for u in found if u.username in added], Notification.Type.CLASS,
                title=f"你已被加入班级：{classroom.name}", link=f"/classes/{classroom.id}",
            )
        not_found = sorted(set(usernames) - found_names)
        return Response({
            "added_count": len(added), "added": added,
            "already": already, "not_found": not_found,
        })

    @action(detail=True, methods=["get"], url_path=r"assignments/(?P<aid>[0-9]+)/leaderboard")
    def assignment_leaderboard(self, request, pk=None, aid=None):
        """某次作业的班级排行榜（教师与班级成员可见）。"""
        classroom = self.get_object()
        if not (self._ensure_teacher(classroom) or classroom.members.filter(user=request.user).exists()):
            return Response({"detail": "无权限"}, status=status.HTTP_403_FORBIDDEN)
        assignment = classroom.assignments.filter(id=aid).prefetch_related("problems").first()
        if not assignment:
            return Response({"detail": "作业不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(compute_assignment_board(assignment, classroom))

    @action(detail=True, methods=["get"],
            url_path=r"assignments/(?P<aid>[0-9]+)/students/(?P<uid>[0-9]+)/submissions")
    def assignment_student_submissions(self, request, pk=None, aid=None, uid=None):
        """查看某学生在该作业题目上的提交记录。教师/管理员可见全部（含源代码），学生仅可看自己。"""
        classroom = self.get_object()
        assignment = classroom.assignments.filter(id=aid).first()
        if not assignment:
            return Response({"detail": "作业不存在"}, status=status.HTTP_404_NOT_FOUND)
        is_teacher = self._ensure_teacher(classroom)
        if not (is_teacher or str(request.user.id) == str(uid)):
            return Response({"detail": "无权限"}, status=status.HTTP_403_FORBIDDEN)

        problems = list(assignment.problems.all().order_by("display_id"))
        pids = [p.id for p in problems]
        subs = list(
            Submission.objects.filter(user_id=uid, problem_id__in=pids)
            .select_related("problem").order_by("-created_at")
        )
        rows = SubmissionListSerializer(subs, many=True, context={"request": request}).data
        if is_teacher:
            code_map = {s.id: s.code for s in subs}
            for r in rows:
                r["code"] = code_map.get(r["id"], "")

        User = get_user_model()
        target = User.objects.filter(id=uid).first()
        return Response({
            "student": {
                "user_id": int(uid),
                "username": target.username if target else "",
                "real_name": target.real_name if target else "",
            },
            "problems": [{"display_id": p.display_id, "title": p.title} for p in problems],
            "submissions": rows,
        })
