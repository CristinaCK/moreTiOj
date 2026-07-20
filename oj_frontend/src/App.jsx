import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ProblemListPage from './pages/ProblemListPage'
import ContestListPage from './pages/ContestListPage'
import DiscussionListPage from './pages/DiscussionListPage'
import ProblemSolvePage from './pages/solve/ProblemSolvePage'
import ContestDetailPage from './pages/contest/ContestDetailPage'
import ContestEditPage from './pages/contest/ContestEditPage'
import DiscussionDetailPage from './pages/discussion/DiscussionDetailPage'
import ClassListPage from './pages/classes/ClassListPage'
import ClassDetailPage from './pages/classes/ClassDetailPage'
import ProblemManageListPage from './pages/manage/ProblemManageListPage'
import ProblemEditPage from './pages/manage/ProblemEditPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import SolutionReviewPage from './pages/admin/SolutionReviewPage'
import SubmissionsAdminPage from './pages/admin/SubmissionsAdminPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* 题库与做题 */}
        <Route path="/problems" element={<ProblemListPage />} />
        <Route path="/problems/:displayId" element={<ProblemSolvePage />} />

        {/* 竞赛 */}
        <Route path="/contests" element={<ContestListPage />} />
        <Route path="/contests/new" element={<ContestEditPage />} />
        <Route path="/contests/:id" element={<ContestDetailPage />} />
        <Route path="/contests/:id/edit" element={<ContestEditPage />} />
        <Route path="/contests/:contestId/problems/:displayId" element={<ProblemSolvePage />} />

        {/* 讨论 */}
        <Route path="/discussions" element={<DiscussionListPage />} />
        <Route path="/discussions/:id" element={<DiscussionDetailPage />} />

        {/* 班级 */}
        <Route path="/classes" element={<ClassListPage />} />
        <Route path="/classes/:id" element={<ClassDetailPage />} />

        {/* 出题管理（教师） */}
        <Route path="/manage/problems" element={<ProblemManageListPage />} />
        <Route path="/manage/problems/new" element={<ProblemEditPage />} />
        <Route path="/manage/problems/:displayId/edit" element={<ProblemEditPage />} />

        {/* 个人 */}
        <Route path="/admin" element={<AdminUsersPage />} />
        <Route path="/admin/solutions" element={<SolutionReviewPage />} />
        <Route path="/admin/submissions" element={<SubmissionsAdminPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* 认证 */}
        <Route path="/login" element={<LoginPage />} />

        <Route path="*" element={<Navigate to="/problems" replace />} />
      </Route>
    </Routes>
  )
}
