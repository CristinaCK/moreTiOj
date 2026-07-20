from rest_framework import serializers

from apps.problems.models import Problem

from .models import Assignment, ClassMember, ClassRoom


class ClassMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    real_name = serializers.CharField(source="user.real_name", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = ClassMember
        fields = ("user_id", "username", "real_name", "role", "joined_at")


class ClassRoomSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.username", read_only=True)
    member_count = serializers.SerializerMethodField()
    invite_code = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = ClassRoom
        fields = (
            "id", "name", "description", "teacher_name",
            "member_count", "invite_code", "my_role", "created_at",
        )

    def get_member_count(self, obj):
        return obj.members.count()

    def get_invite_code(self, obj):
        # 仅班级教师可见邀请码
        user = self.context["request"].user
        return obj.invite_code if user.is_authenticated and obj.teacher_id == user.id else None

    def get_my_role(self, obj):
        user = self.context["request"].user
        if not user.is_authenticated:
            return None
        if obj.teacher_id == user.id:
            return "teacher"
        m = obj.members.filter(user=user).first()
        return m.role if m else None


class ClassRoomCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassRoom
        fields = ("id", "name", "description")


class AssignmentSerializer(serializers.ModelSerializer):
    problems = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = ("id", "title", "problems", "assigned_at", "due_at")

    def get_problems(self, obj):
        return [
            {"display_id": p.display_id, "title": p.title, "difficulty": p.difficulty}
            for p in obj.problems.all()
        ]


class AssignmentCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    problem_display_ids = serializers.ListField(child=serializers.CharField(), allow_empty=False)
    due_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_problem_display_ids(self, value):
        found = set(Problem.objects.filter(display_id__in=value).values_list("display_id", flat=True))
        missing = [d for d in value if d not in found]
        if missing:
            raise serializers.ValidationError(f"题目不存在：{', '.join(missing)}")
        return value
