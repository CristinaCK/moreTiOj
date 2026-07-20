import os
import zipfile

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Max
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.permissions import ProblemWritePermission
from apps.submissions.models import Submission

from .models import Problem
from .serializers import (
    ProblemDetailSerializer,
    ProblemListSerializer,
    ProblemWriteSerializer,
    TestCaseMetaSerializer,
)

ZIP_MAX_BYTES = 100 * 1024 * 1024            # ZIP 包本体上限
UNCOMPRESSED_MAX_BYTES = 256 * 1024 * 1024   # 解压后总大小上限（防 zip bomb）
SINGLE_FILE_MAX_BYTES = 64 * 1024 * 1024     # 单个 .in/.out 上限


def _extract_pairs(zf):
    """
    从 ZIP 中找成对的 .in/.out（仅看文件名 basename，忽略目录与隐藏文件）。
    返回 (ordered, incomplete)：
      ordered    [(stem, in_member, out_member), ...] 按数字优先排序
      incomplete [stem, ...] 只有 .in 或只有 .out 的残缺项
    """
    pairs = {}
    for member in zf.namelist():
        if member.endswith("/"):
            continue
        base = os.path.basename(member)
        if not base or base.startswith("."):
            continue
        stem, ext = os.path.splitext(base)
        if ext in (".in", ".out"):
            pairs.setdefault(stem, {})[ext] = member

    complete = {s: d for s, d in pairs.items() if ".in" in d and ".out" in d}
    incomplete = sorted(s for s, d in pairs.items() if len(d) < 2)

    def sort_key(stem):
        return (0, int(stem), "") if stem.isdigit() else (1, 0, stem)

    ordered = [(s, complete[s][".in"], complete[s][".out"])
               for s in sorted(complete, key=sort_key)]
    return ordered, incomplete


class ProblemViewSet(viewsets.ModelViewSet):
    """
    题库：列表/详情对外开放（按可见性过滤）；
    创建（教师）、编辑/删除（创建者或管理员）；
    测试数据：ZIP 批量上传、元信息查看、分值/样例标记修改、删除。
    Django Admin 仍可用作备用管理入口。
    """

    permission_classes = [ProblemWritePermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["display_id", "title"]
    ordering_fields = ["display_id", "accepted_count", "total_submit"]
    lookup_field = "display_id"

    # ---------- 读 ----------

    def get_queryset(self):
        from django.db.models import Q
        from django.utils import timezone

        qs = Problem.objects.prefetch_related("tags")
        user = self.request.user
        authed = user.is_authenticated
        see_all = authed and (user.is_admin or user.has_perm_key("edit_any_problem"))
        if not see_all:
            cond = Q(visibility=Problem.Visibility.PUBLIC)
            if authed and user.has_perm_key("create_problem"):
                cond |= Q(created_by_id=user.id)  # 出题者可见自己的草稿
            if authed and self.action != "list":
                # 允许学生从“班级作业”进入对应题目（即使题目为隐藏/指定班级可见）
                from apps.classes.models import Assignment, ClassMember

                class_ids = ClassMember.objects.filter(user=user).values_list("classroom_id", flat=True)
                assigned_ids = Assignment.objects.filter(
                    classroom_id__in=class_ids
                ).values_list("problems__id", flat=True)
                cond |= Q(id__in=list(assigned_ids))

                # 允许参赛者/出题人从“竞赛”打开赛题（即使题目为“仅竞赛可见”）。
                # 口径与竞赛详情里赛题的可见规则一致（见 contests.serializers.get_problems）：
                #   · 教师可见所有竞赛的赛题；
                #   · 创建者可见自己所建竞赛的赛题；
                #   · 普通选手在“竞赛已开始且本人已报名”后可见。
                # 仅对 retrieve 等非 list 动作放行，因此题库列表不会泄露仅竞赛可见的题目。
                from apps.contests.models import Contest, ContestProblem

                if user.is_teacher:
                    accessible_contests = Contest.objects.all()
                else:
                    accessible_contests = Contest.objects.filter(
                        Q(created_by_id=user.id)
                        | Q(participants__user=user, start_time__lte=timezone.now())
                    )
                contest_problem_ids = ContestProblem.objects.filter(
                    contest__in=accessible_contests
                ).values_list("problem_id", flat=True)
                cond |= Q(id__in=list(contest_problem_ids))
            qs = qs.filter(cond)
        difficulty = self.request.query_params.get("difficulty")
        if difficulty:
            qs = qs.filter(difficulty=difficulty)
        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__name=tag)
        ptype = self.request.query_params.get("problem_type")
        if ptype:
            qs = qs.filter(problem_type=ptype)
        return qs.distinct()

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProblemWriteSerializer
        if self.action == "retrieve":
            return ProblemDetailSerializer
        return ProblemListSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        if self.action == "list" and user.is_authenticated:
            status_map = {}
            for s in Submission.objects.filter(user=user).values("problem_id", "status"):
                pid = s["problem_id"]
                if s["status"] == "accepted":
                    status_map[pid] = "solved"
                elif status_map.get(pid) != "solved":
                    status_map[pid] = "attempted"
            ctx["status_map"] = status_map
        return ctx

    # ---------- 写（创建者或管理员） ----------

    def _can_manage(self, problem):
        user = self.request.user
        return user.is_authenticated and (
            user.is_admin
            or user.has_perm_key("edit_any_problem")
            or problem.created_by_id == user.id
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(
            ProblemDetailSerializer(serializer.instance, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        problem = self.get_object()
        if not self._can_manage(problem):
            return Response({"detail": "仅题目创建者或管理员可修改"}, status=status.HTTP_403_FORBIDDEN)
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(problem, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            ProblemDetailSerializer(problem, context=self.get_serializer_context()).data
        )

    def destroy(self, request, *args, **kwargs):
        problem = self.get_object()
        if not self._can_manage(problem):
            return Response({"detail": "仅题目创建者或管理员可删除"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    # ---------- 测试数据管理 ----------

    @action(detail=True, methods=["get"])
    def testcases(self, request, display_id=None):
        problem = self.get_object()
        if not self._can_manage(problem):
            return Response({"detail": "仅题目创建者或管理员可查看测试数据"},
                            status=status.HTTP_403_FORBIDDEN)
        return Response(TestCaseMetaSerializer(problem.test_cases.all(), many=True).data)

    @action(detail=True, methods=["post"], url_path="upload-testcases")
    def upload_testcases(self, request, display_id=None):
        """
        ZIP 批量上传测试数据。
        form-data：file=<zip>；mode=replace（默认，清空重建）| append（追加到末尾）。
        ZIP 内放成对的 1.in/1.out、2.in/2.out…（可带目录，按文件名配对）。
        """
        problem = self.get_object()
        if not self._can_manage(problem):
            return Response({"detail": "仅题目创建者或管理员可上传测试数据"},
                            status=status.HTTP_403_FORBIDDEN)

        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "请以 multipart/form-data 上传 file 字段（ZIP 文件）"},
                            status=status.HTTP_400_BAD_REQUEST)
        if upload.size > ZIP_MAX_BYTES:
            return Response({"detail": "ZIP 超过大小上限"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            zf = zipfile.ZipFile(upload)
        except zipfile.BadZipFile:
            return Response({"detail": "不是有效的 ZIP 文件"}, status=status.HTTP_400_BAD_REQUEST)

        ordered, incomplete = _extract_pairs(zf)
        if not ordered:
            return Response(
                {"detail": "ZIP 中未找到成对的 .in/.out 文件", "incomplete": incomplete},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total = 0
        for _, in_m, out_m in ordered:
            in_size = zf.getinfo(in_m).file_size
            out_size = zf.getinfo(out_m).file_size
            if in_size > SINGLE_FILE_MAX_BYTES or out_size > SINGLE_FILE_MAX_BYTES:
                return Response({"detail": "存在超过单文件大小上限的测试点"},
                                status=status.HTTP_400_BAD_REQUEST)
            total += in_size + out_size
        if total > UNCOMPRESSED_MAX_BYTES:
            return Response({"detail": "解压后总大小超过上限"}, status=status.HTTP_400_BAD_REQUEST)

        mode = request.data.get("mode", "replace")
        if mode not in ("replace", "append"):
            return Response({"detail": "mode 仅支持 replace / append"},
                            status=status.HTTP_400_BAD_REQUEST)

        from .models import TestCase

        with transaction.atomic():
            if mode == "replace":
                for tc in problem.test_cases.all():
                    tc.input_file.delete(save=False)
                    tc.output_file.delete(save=False)
                problem.test_cases.all().delete()
                start = 1
            else:
                start = (problem.test_cases.aggregate(m=Max("index"))["m"] or 0) + 1

            indexes = []
            for offset, (_, in_m, out_m) in enumerate(ordered):
                idx = start + offset
                tc = TestCase(problem=problem, index=idx, score=10, is_sample=False)
                tc.input_file.save(f"{problem.display_id}_{idx}.in",
                                   ContentFile(zf.read(in_m)), save=False)
                tc.output_file.save(f"{problem.display_id}_{idx}.out",
                                    ContentFile(zf.read(out_m)), save=False)
                tc.save()
                indexes.append(idx)

        return Response(
            {"detail": f"已导入 {len(indexes)} 个测试点（{mode}）",
             "indexes": indexes, "incomplete_skipped": incomplete},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch"], url_path="update-testcases")
    def update_testcases(self, request, display_id=None):
        """批量修改测试点元信息：{"items": [{"index": 1, "score": 20, "is_sample": true}, ...]}"""
        problem = self.get_object()
        if not self._can_manage(problem):
            return Response({"detail": "仅题目创建者或管理员可修改测试数据"},
                            status=status.HTTP_403_FORBIDDEN)
        items = request.data.get("items")
        if not isinstance(items, list) or not items:
            return Response({"detail": "items 必须为非空列表"}, status=status.HTTP_400_BAD_REQUEST)

        updated, missing = [], []
        for item in items:
            tc = problem.test_cases.filter(index=item.get("index")).first()
            if tc is None:
                missing.append(item.get("index"))
                continue
            if "score" in item:
                tc.score = max(0, int(item["score"]))
            if "is_sample" in item:
                tc.is_sample = bool(item["is_sample"])
            if "group" in item:
                tc.group = max(0, int(item["group"]))
            tc.save(update_fields=["score", "is_sample", "group"])
            updated.append(tc.index)
        return Response({"updated": updated, "missing": missing})

    @action(detail=True, methods=["post"], url_path="delete-testcases")
    def delete_testcases(self, request, display_id=None):
        """删除测试点：{"indexes": [1,2]}；不传 indexes 则清空全部。"""
        problem = self.get_object()
        if not self._can_manage(problem):
            return Response({"detail": "仅题目创建者或管理员可删除测试数据"},
                            status=status.HTTP_403_FORBIDDEN)
        qs = problem.test_cases.all()
        indexes = request.data.get("indexes")
        if indexes:
            qs = qs.filter(index__in=indexes)
        count = 0
        for tc in qs:
            tc.input_file.delete(save=False)
            tc.output_file.delete(save=False)
            tc.delete()
            count += 1
        return Response({"deleted": count})
