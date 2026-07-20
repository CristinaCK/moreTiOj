from rest_framework import serializers

from apps.problems.models import Problem

from .models import Solution


class SolutionListSerializer(serializers.ModelSerializer):
    problem_display_id = serializers.CharField(source="problem.display_id", read_only=True)
    author_name = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = Solution
        fields = (
            "id", "problem_display_id", "author_name", "title", "language",
            "audit_status", "created_at", "published_at",
        )


class SolutionDetailSerializer(SolutionListSerializer):
    reject_reason = serializers.SerializerMethodField()

    class Meta(SolutionListSerializer.Meta):
        fields = SolutionListSerializer.Meta.fields + ("content", "reject_reason")

    def get_reject_reason(self, obj):
        """驳回理由仅作者与管理员可见。"""
        user = self.context["request"].user
        if user.is_authenticated and (user.id == obj.author_id or user.is_admin):
            return obj.reject_reason
        return ""


class SolutionCreateSerializer(serializers.ModelSerializer):
    problem = serializers.SlugRelatedField(slug_field="display_id", queryset=Problem.objects.all())

    class Meta:
        model = Solution
        fields = ("id", "problem", "title", "content", "language")


class SolutionUpdateSerializer(serializers.ModelSerializer):
    """修改不允许更换题目。"""

    class Meta:
        model = Solution
        fields = ("title", "content", "language")


class SolutionRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=512, required=False, allow_blank=True, default="")
