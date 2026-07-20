from rest_framework import serializers

from apps.problems.models import Problem

from .models import Discussion, DiscussionReply


class DiscussionListSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    problem_display_id = serializers.SerializerMethodField()

    class Meta:
        model = Discussion
        fields = (
            "id", "title", "author_name", "category", "problem_display_id",
            "audit_status", "reply_count", "created_at", "updated_at",
        )

    def get_problem_display_id(self, obj):
        return obj.problem.display_id if obj.problem_id else None


class DiscussionDetailSerializer(DiscussionListSerializer):
    class Meta(DiscussionListSerializer.Meta):
        fields = DiscussionListSerializer.Meta.fields + ("content",)


class DiscussionCreateSerializer(serializers.ModelSerializer):
    problem = serializers.SlugRelatedField(
        slug_field="display_id", queryset=Problem.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model = Discussion
        fields = ("id", "title", "content", "category", "problem")


class ReplySerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    parent_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = DiscussionReply
        fields = ("id", "author_name", "parent_id", "content", "created_at")


class ReplyCreateSerializer(serializers.Serializer):
    content = serializers.CharField()
    parent = serializers.IntegerField(required=False, allow_null=True)
