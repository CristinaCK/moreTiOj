"""可由管理员开关授予的细粒度权限定义。

- 管理员（role=admin / superuser）隐含拥有全部权限。
- 教师（role=teacher）默认拥有 ROLE_BASE_PERMS 中的基线权限。
- 任意用户都可由管理员在后台逐项开关 granted_permissions。
"""

# (key, 中文说明)：管理后台据此渲染开关
PERMISSION_CATALOG = [
    ("create_problem", "出题（创建并管理自己的题目）"),
    ("edit_any_problem", "管理所有题目（不止自己创建的）"),
    ("review_solution", "审核题解"),
]

ALL_PERMISSION_KEYS = [k for k, _ in PERMISSION_CATALOG]

# 角色自带的基线权限（管理员单独处理为全部）
ROLE_BASE_PERMS = {
    "user": [],
    "teacher": ["create_problem"],
    "admin": list(ALL_PERMISSION_KEYS),
}
