from rest_framework import serializers

from apps.problems.models import Problem

from .models import Contest, ContestProblem


class ContestProblemSerializer(serializers.ModelSerializer):
    display_id = serializers.CharField(source="problem.display_id", read_only=True)
    title = serializers.CharField(source="problem.title", read_only=True)
    difficulty = serializers.CharField(source="problem.difficulty", read_only=True)

    class Meta:
        model = ContestProblem
        fields = ("label", "score", "display_id", "title", "difficulty")


class ContestListSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()
    is_registered = serializers.SerializerMethodField()

    class Meta:
        model = Contest
        fields = (
            "id", "title", "rule_type", "visibility",
            "start_time", "end_time", "status",
            "participant_count", "is_registered",
            "hide_results_during_contest",
        )

    def get_status(self, obj):
        if not obj.is_started:
            return "upcoming"
        return "ended" if obj.is_ended else "running"

    def get_participant_count(self, obj):
        return obj.participants.count()

    def get_is_registered(self, obj):
        user = self.context["request"].user
        return user.is_authenticated and obj.participants.filter(user=user).exists()


class ContestDetailSerializer(ContestListSerializer):
    problems = serializers.SerializerMethodField()

    class Meta(ContestListSerializer.Meta):
        fields = ContestListSerializer.Meta.fields + (
            "description", "penalty_minutes", "freeze_minutes", "problems",
        )

    def get_problems(self, obj):
        """题目仅在「已开始且已报名」或「创建者/教师」时可见。"""
        user = self.context["request"].user
        can_see = user.is_authenticated and (
            user.is_teacher
            or obj.created_by_id == user.id
            or (obj.is_started and obj.participants.filter(user=user).exists())
        )
        if not can_see:
            return []
        return ContestProblemSerializer(
            obj.contest_problems.select_related("problem"), many=True
        ).data


class ContestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contest
        fields = (
            "id", "title", "description", "start_time", "end_time",
            "rule_type", "visibility", "password", "classroom",
            "penalty_minutes", "freeze_minutes",
            "hide_results_during_contest",
        )

    def validate(self, attrs):
        start = attrs.get("start_time")
        end = attrs.get("end_time")
        if start and end and end <= start:
            raise serializers.ValidationError("结束时间必须晚于开始时间")
        return attrs


class AddContestProblemSerializer(serializers.Serializer):
    display_id = serializers.CharField()
    label = serializers.CharField(max_length=8)
    score = serializers.IntegerField(default=100, min_value=0)

    def validate_display_id(self, value):
        if not Problem.objects.filter(display_id=value).exists():
            raise serializers.ValidationError("题目不存在")
        return value
