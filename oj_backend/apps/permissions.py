from rest_framework import permissions


class IsTeacherOrReadOnly(permissions.BasePermission):
    """读放开；写操作要求教师及以上。"""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_teacher)


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


def _has(user, key):
    return bool(user and user.is_authenticated and user.has_perm_key(key))


class CanReviewSolution(permissions.BasePermission):
    """题解审核：拥有 review_solution 权限或管理员。"""

    def has_permission(self, request, view):
        return _has(request.user, "review_solution")


class ProblemWritePermission(permissions.BasePermission):
    """题目写权限：
    - 读：放开
    - 创建：需 create_problem
    - 改/删（对象级）：管理员、或拥有 edit_any_problem、或题目创建者
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        if getattr(view, "action", None) == "create":
            return _has(request.user, "create_problem")
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return user.is_admin or _has(user, "edit_any_problem") or obj.created_by_id == user.id
