import client from './client'

const get = (url, params) => client.get(url, { params }).then((r) => r.data)
const post = (url, data) => client.post(url, data).then((r) => r.data)
const patch = (url, data) => client.patch(url, data).then((r) => r.data)
const del = (url) => client.delete(url).then((r) => r.data)

/* ---------- 认证（账号由管理员统一创建，无自助注册/改密） ---------- */
export const login = (username, password) => post('/auth/login/', { username, password })
export const me = () => get('/auth/me/')
export const updateMe = (data) => patch('/auth/me/', data)

/* ---------- 全站排行榜 ---------- */
export const listRanking = (params) => get('/ranking/', params)

/* ---------- 管理后台（仅管理员） ---------- */
export const listAdminUsers = (params) => get('/auth/admin/users/', params)
export const createAdminUser = (data) => post('/auth/admin/users/', data)
export const batchCreateAdminUsers = (users) => post('/auth/admin/users/batch/', { users })
export const setAdminUserPassword = (id, password) =>
  post(`/auth/admin/users/${id}/set-password/`, { password })
export const updateAdminUser = (id, data) => patch(`/auth/admin/users/${id}/`, data)
export const getPermissionCatalog = () => get('/auth/admin/permissions/')

/* ---------- 题库 ---------- */
export const listProblems = (params) => get('/problems/', params)
export const getProblem = (displayId) => get(`/problems/${displayId}/`)
export const createProblem = (data) => post('/problems/', data)
export const updateProblem = (displayId, data) => patch(`/problems/${displayId}/`, data)
export const deleteProblem = (displayId) => del(`/problems/${displayId}/`)
/* 测试数据管理（教师/管理员） */
export const listTestcases = (displayId) => get(`/problems/${displayId}/testcases/`)
export const uploadTestcases = (displayId, formData) =>
  client
    .post(`/problems/${displayId}/upload-testcases/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
export const updateTestcases = (displayId, items) =>
  patch(`/problems/${displayId}/update-testcases/`, { items })
export const deleteTestcases = (displayId, indexes) =>
  post(`/problems/${displayId}/delete-testcases/`, indexes ? { indexes } : {})

/* ---------- 提交 ---------- */
export const createSubmission = (data) => post('/submissions/', data)
export const runCode = (data) => post('/submissions/run/', data)
export const getSubmission = (id) => get(`/submissions/${id}/`)
export const listSubmissions = (params) => get('/submissions/', params)

/* ---------- 题解 ---------- */
export const listSolutions = (params) => get('/solutions/', params)
export const getSolution = (id) => get(`/solutions/${id}/`)
export const createSolution = (data) => post('/solutions/', data)
export const updateSolution = (id, data) => patch(`/solutions/${id}/`, data)
export const approveSolution = (id) => post(`/solutions/${id}/approve/`, {})
export const rejectSolution = (id, reason) => post(`/solutions/${id}/reject/`, { reason })

/* ---------- 竞赛 ---------- */
export const listContests = (params) => get('/contests/', params)
export const getContest = (id) => get(`/contests/${id}/`)
export const createContest = (data) => post('/contests/', data)
export const updateContest = (id, data) => patch(`/contests/${id}/`, data)
export const deleteContest = (id) => del(`/contests/${id}/`)
export const registerContest = (id, password) =>
  post(`/contests/${id}/register/`, password ? { password } : {})
export const getLeaderboard = (id) => get(`/contests/${id}/leaderboard/`)
export const addContestProblem = (id, data) => post(`/contests/${id}/add_problem/`, data)
export const addContestParticipants = (id, usernames) =>
  post(`/contests/${id}/add_participants/`, { usernames })
export const removeContestParticipant = (id, username) =>
  post(`/contests/${id}/remove_participant/`, { username })

/* ---------- 讨论 ---------- */
export const listDiscussions = (params) => get('/discussions/', params)
export const getDiscussion = (id) => get(`/discussions/${id}/`)
export const createDiscussion = (data) => post('/discussions/', data)
export const updateDiscussion = (id, data) => patch(`/discussions/${id}/`, data)
export const deleteDiscussion = (id) => del(`/discussions/${id}/`)
export const moderateDiscussion = (id, status) => post(`/discussions/${id}/moderate/`, { status })
export const listReplies = (id, params) => get(`/discussions/${id}/replies/`, params)
export const createReply = (id, data) => post(`/discussions/${id}/replies/`, data)
export const deleteReply = (replyId) => del(`/discussion-replies/${replyId}/`)

/* ---------- 班级 ---------- */
export const listClasses = (params) => get('/classes/', params)
export const getClass = (id) => get(`/classes/${id}/`)
export const createClass = (data) => post('/classes/', data)
export const updateClass = (id, data) => patch(`/classes/${id}/`, data)
export const deleteClass = (id) => del(`/classes/${id}/`)
export const joinClass = (inviteCode) => post('/classes/join/', { invite_code: inviteCode })
export const listClassMembers = (id) => get(`/classes/${id}/members/`)
export const removeClassMember = (id, userId) => post(`/classes/${id}/remove_member/`, { user_id: userId })
export const addClassMembers = (id, usernames) => post(`/classes/${id}/add-members/`, { usernames })
export const listAssignments = (id) => get(`/classes/${id}/assignments/`)
export const createAssignment = (id, data) => post(`/classes/${id}/assignments/`, data)
export const getAssignmentLeaderboard = (id, aid) => get(`/classes/${id}/assignments/${aid}/leaderboard/`)
export const getAssignmentStudentSubmissions = (id, aid, uid) =>
  get(`/classes/${id}/assignments/${aid}/students/${uid}/submissions/`)

/* ---------- 通知 ---------- */
export const unreadCount = () => get('/notifications/unread_count/')
export const listNotifications = (params) => get('/notifications/', params)
export const readAllNotifications = () => post('/notifications/read_all/')
export const readNotification = (id) => post(`/notifications/${id}/read/`)

/* ---------- 错误信息提取 ---------- */
export function errMsg(error, fallback = '操作失败，请稍后重试') {
  const d = error?.response?.data
  if (!d) return fallback
  if (typeof d === 'string') return fallback
  if (Array.isArray(d)) return String(d[0])
  if (d.detail) return Array.isArray(d.detail) ? String(d.detail[0]) : String(d.detail)
  const key = Object.keys(d)[0]
  if (key) {
    const v = d[key]
    return `${key}: ${Array.isArray(v) ? v[0] : v}`
  }
  return fallback
}
