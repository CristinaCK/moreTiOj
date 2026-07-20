from rest_framework import serializers

from django.db import IntegrityError, transaction

from apps.judge.languages import LANGUAGES

from .models import Problem, Tag, TestCase


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ("id", "name")


class ProblemListSerializer(serializers.ModelSerializer):
    accept_rate = serializers.FloatField(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    user_status = serializers.SerializerMethodField()

    class Meta:
        model = Problem
        fields = (
            "id", "display_id", "title", "difficulty",
            "accept_rate", "total_submit", "accepted_count",
            "tags", "user_status",
        )

    def get_user_status(self, obj):
        """当前用户对该题的状态：solved / attempted / none。"""
        user = self.context["request"].user
        if not user.is_authenticated:
            return "none"
        status_map = self.context.get("status_map", {})
        return status_map.get(obj.id, "none")


class ProblemDetailSerializer(serializers.ModelSerializer):
    accept_rate = serializers.FloatField(read_only=True)
    tags = TagSerializer(many=True, read_only=True)
    sample_test_cases = serializers.SerializerMethodField()
    cloze_blank_count = serializers.SerializerMethodField()
    cloze_answers_view = serializers.SerializerMethodField()

    class Meta:
        model = Problem
        fields = (
            "id", "display_id", "title", "difficulty",
            "description", "input_description", "output_description",
            "samples", "hint", "source",
            "time_limit", "memory_limit", "allowed_languages",
            "compare_mode", "float_precision", "spj_enabled", "visibility",
            "accept_rate", "total_submit", "accepted_count",
            "tags", "sample_test_cases",
            # 程序填空题（绝不向学生暴露 cloze_answers）
            "problem_type", "cloze_template", "cloze_language",
            "cloze_use_judge", "cloze_blank_count", "cloze_answers_view",
        )

    def get_cloze_blank_count(self, obj):
        import re
        if obj.problem_type != Problem.ProblemType.CLOZE:
            return 0
        return len({int(n) for n in re.findall(r"__(\d+)__", obj.cloze_template or "")})

    def get_cloze_answers_view(self, obj):
        """仅题目管理者（创建者/管理所有题目/管理员）可取回参考答案，供编辑回填。"""
        if obj.problem_type != Problem.ProblemType.CLOZE:
            return None
        u = getattr(self.context.get("request"), "user", None)
        if not (u and u.is_authenticated):
            return None
        can = u.is_admin or u.has_perm_key("edit_any_problem") or obj.created_by_id == u.id
        return obj.cloze_answers if can else None

    def get_sample_test_cases(self, obj):
        cases = obj.test_cases.filter(is_sample=True)
        out = []
        for c in cases:
            try:
                inp = c.input_file.read().decode("utf-8", "replace")
                ans = c.output_file.read().decode("utf-8", "replace")
            except Exception:
                inp, ans = "", ""
            out.append({"index": c.index, "input": inp, "output": ans})
        return out


class ProblemWriteSerializer(serializers.ModelSerializer):
    """教师创建/编辑题目；tags 传标签名列表，自动建标签。"""

    tags = serializers.ListField(
        child=serializers.CharField(max_length=64), required=False, write_only=True
    )

    class Meta:
        model = Problem
        fields = (
            "display_id", "title", "difficulty",
            "description", "input_description", "output_description",
            "samples", "hint", "source",
            "time_limit", "memory_limit",
            "compare_mode", "float_precision",
            "spj_enabled", "spj_language", "spj_code",
            "allowed_languages", "visibility", "tags",
            "problem_type", "cloze_template", "cloze_language",
            "cloze_use_judge", "cloze_answers",
        )
        # 题号由系统自动分配，禁止前端/接口设置或修改
        read_only_fields = ("display_id",)

    def validate_allowed_languages(self, value):
        bad = [v for v in value if v not in LANGUAGES]
        if bad:
            raise serializers.ValidationError(f"不支持的语言：{', '.join(bad)}")
        if not value:
            raise serializers.ValidationError("至少允许一种语言")
        return value

    def validate_samples(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("samples 必须是列表")
        for s in value:
            if not isinstance(s, dict) or "input" not in s or "output" not in s:
                raise serializers.ValidationError('每个样例需为 {"input": ..., "output": ...} 结构')
        return value

    def validate(self, attrs):
        # 兼容 partial update：未提交的字段回退到实例现值
        def merged(key, default):
            if key in attrs:
                return attrs[key]
            return getattr(self.instance, key, default) if self.instance else default

        if merged("spj_enabled", False) and not str(merged("spj_code", "")).strip():
            raise serializers.ValidationError("启用 SPJ 时必须提供 SPJ 源代码")
        return attrs

    def _set_tags(self, problem, tag_names):
        tags = [Tag.objects.get_or_create(name=n.strip())[0] for n in tag_names if n.strip()]
        problem.tags.set(tags)

    @staticmethod
    def _next_display_id():
        # 题号由系统自动分配：取现有纯数字题号的最大值 +1（从 1 开始，无前导零）。
        nums = [
            int(d) for d in Problem.objects.values_list("display_id", flat=True)
            if d and str(d).isdigit()
        ]
        return str((max(nums) + 1) if nums else 1)

    def create(self, validated_data):
        tag_names = validated_data.pop("tags", [])
        validated_data.pop("display_id", None)  # 忽略任何外部传入，始终由系统生成
        # 并发下可能撞号，重试若干次直至成功
        for _ in range(20):
            try:
                with transaction.atomic():
                    problem = Problem.objects.create(
                        display_id=self._next_display_id(), **validated_data
                    )
                break
            except IntegrityError:
                continue
        else:
            raise serializers.ValidationError("题号自动分配失败，请重试")
        self._set_tags(problem, tag_names)
        return problem

    def update(self, instance, validated_data):
        tag_names = validated_data.pop("tags", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if tag_names is not None:
            self._set_tags(instance, tag_names)
        return instance


class TestCaseMetaSerializer(serializers.ModelSerializer):
    """测试点元信息（不含数据内容本身）。"""

    input_size = serializers.SerializerMethodField()
    output_size = serializers.SerializerMethodField()

    class Meta:
        model = TestCase
        fields = ("index", "score", "group", "is_sample", "input_size", "output_size")

    def get_input_size(self, obj):
        try:
            return obj.input_file.size
        except Exception:
            return None

    def get_output_size(self, obj):
        try:
            return obj.output_file.size
        except Exception:
            return None
