// 判断当前用户是否拥有某项权限。管理员隐含拥有全部。
export const hasPerm = (user, key) =>
  !!user && (user.is_admin || (user.effective_permissions || []).includes(key))

// 是否能进入“出题管理”
export const canManageProblems = (user) =>
  hasPerm(user, 'create_problem') || hasPerm(user, 'edit_any_problem')

// 权限 key -> 中文名（与后端 PERMISSION_CATALOG 对应；后台会优先用接口返回的目录）
export const PERMISSION_LABELS = {
  create_problem: '出题（创建并管理自己的题目）',
  edit_any_problem: '管理所有题目',
  review_solution: '审核题解',
}
