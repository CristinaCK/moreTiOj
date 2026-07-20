import { Avatar, Button, Dropdown, Space } from 'antd'
import {
  AuditOutlined,
  ControlOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  SettingOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { canManageProblems, hasPerm } from '../utils/perm'
import NotificationBell from './NotificationBell'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // 题库/竞赛/讨论为公共导航；班级面向登录用户（教学场景）
  const navs = [
    { to: '/problems', label: '题库' },
    { to: '/contests', label: '竞赛' },
    { to: '/discussions', label: '讨论' },
  ]
  if (user) navs.push({ to: '/classes', label: '班级' })

  const menuItems = [
    { key: 'username', label: `已登录：${user?.username || ''}`, disabled: true },
    { type: 'divider' },
    { key: 'profile', icon: <UserOutlined />, label: '个人主页' },
    { key: 'settings', icon: <SettingOutlined />, label: '个人设置' },
    ...(canManageProblems(user)
      ? [{ key: 'manage', icon: <SolutionOutlined />, label: '出题管理' }]
      : []),
    ...(hasPerm(user, 'review_solution')
      ? [{ key: 'review', icon: <AuditOutlined />, label: '题解审核' }]
      : []),
    ...(user?.is_admin
      ? [
          { key: 'admin', icon: <ControlOutlined />, label: '管理后台' },
          { key: 'records', icon: <FileSearchOutlined />, label: '测评记录' },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ]

  const onMenuClick = ({ key }) => {
    if (key === 'profile') navigate('/profile')
    else if (key === 'settings') navigate('/settings')
    else if (key === 'manage') navigate('/manage/problems')
    else if (key === 'review') navigate('/admin/solutions')
    else if (key === 'admin') navigate('/admin')
    else if (key === 'records') navigate('/admin/submissions')
    else if (key === 'logout') {
      logout()
      navigate('/problems')
    }
  }

  return (
    <div>
      <header className="app-header">
        <div className="header-inner">
          <NavLink to="/" className="logo">
            墨题<span className="dot">·</span>OJ
          </NavLink>
          <nav className="nav-links">
            {navs.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-right">
            {user ? (
              <Space size={16}>
                <NotificationBell />
                <Dropdown menu={{ items: menuItems, onClick: onMenuClick }}>
                  <Avatar
                    size={32}
                    src={user.avatar || undefined}
                    icon={<UserOutlined />}
                    style={{ cursor: 'pointer', background: '#0d6e56' }}
                  />
                </Dropdown>
              </Space>
            ) : (
              <Button type="primary" onClick={() => navigate('/login')}>
                登录
              </Button>
            )}
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
