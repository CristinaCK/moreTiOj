from rest_framework import serializers

from apps.problems.models import Problem

from .models import Submission, SubmissionTestResult


def _read_head(filefield, limit=4000):
    """按需读取测试文件开头若干字符；文件不存在/不可读时返回空串。
    输入与期望输出不再逐份存进每条提交，查看详情时才从题目测试文件读取。"""
    try:
        path = filefield.path if filefield else None
    except (ValueError, AttributeError):
        path = None
    if not path:
        return ""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read(limit)
    except OSError:
        return ""


class SubmissionCreateSerializer(serializers.ModelSerializer):
    problem = serializers.SlugRelatedField(
        slug_field="display_id", queryset=Problem.objects.all()
    )
    language = serializers.CharField(required=False, allow_blank=True, default="")
    code = serializers.CharField(required=False, allow_blank=True, default="")
    cloze_answers = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = Submission
        fields = ("problem", "language", "code", "contest", "cloze_answers")

    def validate(self, attrs):
        problem = attrs["problem"]

        if problem.problem_type == Problem.ProblemType.CLOZE:
            answers = attrs.get("cloze_answers") or {}
            if not isinstance(answers, dict) or not any(str(v).strip() for v in answers.values()):
                raise serializers.ValidationError("请至少填写一个空")
            attrs["language"] = problem.cloze_language or "python3"
            attrs["code"] = ""
        else:
            lang = attrs.get("language")
            if not lang:
                raise serializers.ValidationError("请选择语言")
            if not (attrs.get("code") or "").strip():
                raise serializers.ValidationError("代码不能为空")
            if lang not in problem.allowed_languages:
                raise serializers.ValidationError(f"该题不允许语言：{lang}")

        contest = attrs.get("contest")
        if contest is not None:
            user = self.context["request"].user
            if not contest.is_running:
                raise serializers.ValidationError("竞赛不在进行中，无法提交")
            if not contest.participants.filter(user=user).exists():
                raise serializers.ValidationError("你尚未报名该竞赛")
            if not contest.contest_problems.filter(problem=problem).exists():
                raise serializers.ValidationError("该题目不属于此竞赛")
        return attrs


class TestResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubmissionTestResult
        fields = (
            "index", "status", "group", "time_used", "memory_used", "score",
            "is_sample",
            "input_preview", "expected_output", "actual_output",
        )


class SubmissionListSerializer(serializers.ModelSerializer):
    problem_display_id = serializers.CharField(source="problem.display_id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    name = serializers.CharField(source="user.display_name", read_only=True)
    source = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            "id", "problem_display_id", "username", "name", "language", "status",
            "score", "time_used", "memory_used", "first_failed_index", "created_at",
            "contest", "source",
            "sealed",
        )

    def get_source(self, obj):
        """提交来源：竞赛名 / 作业名 / 题库。"""
        if obj.contest_id:
            return obj.contest.title
        from apps.classes.models import Assignment
        a = (
            Assignment.objects
            .filter(problems=obj.problem_id, classroom__members__user=obj.user_id)
            .order_by("-assigned_at")
            .first()
        )
        if a:
            return a.title
        return "题库"

    # “sealed” 不是模型字段：由 to_representation 计算后写入
    sealed = serializers.SerializerMethodField()

    def get_sealed(self, obj):
        request = self.context.get("request")
        return obj.results_sealed_for(getattr(request, "user", None))

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if data.get("sealed"):
            # 竞赛进行中，对普通参赛者只保留“已提交”，抹掉一切评测结果
            data["status"] = "sealed"
            data["score"] = None
            data["time_used"] = None
            data["memory_used"] = None
            data["first_failed_index"] = None
        return data


class SubmissionDetailSerializer(SubmissionListSerializer):
    test_results = TestResultSerializer(many=True, read_only=True)
    code = serializers.SerializerMethodField()

    class Meta(SubmissionListSerializer.Meta):
        fields = SubmissionListSerializer.Meta.fields + (
            "code", "compile_error", "is_public", "test_results",
        )

    def get_code(self, obj):
        # 仅作者/管理员或赛后公开者可见源代码（封存期作者仍可查看自己的代码）
        user = self.context["request"].user
        return obj.code if obj.can_be_viewed_by(user) else None

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if data.get("sealed"):
            # 详情页还需抹掉编译信息与逐测试点结果
            data["compile_error"] = ""
            data["test_results"] = []
            return data
        user = self.context["request"].user
        is_admin = user.is_authenticated and getattr(user, "is_admin", False)
        results = data.get("test_results", [])
        if results:
            # 展示数据的测试点：样例点对所有人可见，隐藏点仅管理员可见。
            # 输入/期望输出不在提交里冗余存储，这里按需从题目测试文件读取。
            tc_map = {}
            if any(r.get("is_sample") or is_admin for r in results):
                from apps.problems.models import TestCase
                tc_map = {
                    tc.index: tc
                    for tc in TestCase.objects.filter(problem_id=obj.problem_id)
                }
            for r in results:
                if r.get("is_sample") or is_admin:
                    tc = tc_map.get(r.get("index"))
                    if tc:
                        r["input_preview"] = _read_head(tc.input_file)
                        r["expected_output"] = _read_head(tc.output_file)
                    # actual_output：样例点已保存；隐藏点未保存（管理员可查看源代码复现）
                else:
                    r["input_preview"] = ""
                    r["expected_output"] = ""
                    r["actual_output"] = ""
        return data
