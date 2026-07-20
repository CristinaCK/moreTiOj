import { useEffect, useMemo, useState } from 'react'
import { Avatar, Button, Card, Empty, Spin, Statistic, Tag, Tooltip, Typography } from 'antd'
import { SettingOutlined, UserOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../api'
import { useAuth } from '../auth/AuthContext'
import SubmissionHeatmap from '../components/SubmissionHeatmap'
import VerdictTag from '../components/VerdictTag'

const ROLE = {
  user: { label: '学生', color: 'default' },
  teacher: { label: '教师', color: 'green' },
  admin: { label: '管理员', color: 'gold' },
}

// 最多抓取的提交页数（每页 20），用于绘制热力图与近期活动
const MAX_PAGES = 20

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [subs, setSubs] = useState(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const all = []
    const fetchPage = async (page) => {
      const d = await api.listSubmissions({ mine: 1, page })
      all.push(...(d.results || []))
      if (page === 1) setCount(d.count || 0)
      if (d.next && page < MAX_PAGES && !cancelled) {
        await fetchPage(page + 1)
      }
    }
    fetchPage(1)
      .then(() => {
        if (!cancelled) setSubs(all)
      })
      .catch(() => {
        if (!cancelled) setSubs([])
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const heatData = useMemo(() => {
    if (!subs) return []
    const map = {}
    subs.forEach((s) => {
      const day = dayjs(s.created_at).format('YYYY-MM-DD')
      map[day] = (map[day] || 0) + 1
    })
    return Object.entries(map).map(([date, c]) => ({ date, count: c }))
  }, [subs])

  if (!user) {
    return (
      <div className="page-container">
        <Empty description="请先登录查看个人主页" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Link to="/login">
            <Button type="primary">去登录</Button>
          </Link>
        </Empty>
      </div>
    )
  }

  const role = ROLE[user.role] || ROLE.user
  // 提交通过率 = AC 提交数 ÷ 提交总数（按提交计）。基于已拉取的提交集合计算，
  // 未截断时即为全量；截断时为近 N 条窗口内的占比（页面下方有提示）。
  const acCount = useMemo(() => (subs || []).filter((s) => s.status === 'accepted').length, [subs])
  const rate = subs && subs.length ? Math.round((acCount / subs.length) * 1000) / 10 : 0

  return (
    <div className="page-container">
      <div className="profile-grid">
        {/* 左侧：资料卡 */}
        <Card className="card" bordered={false} style={{ height: 'fit-content' }}>
          <div style={{ textAlign: 'center' }}>
            <Avatar
              size={84}
              src={user.avatar || undefined}
              icon={<UserOutlined />}
              style={{ background: 'var(--pine)' }}
            />
            <h2 className="serif" style={{ fontSize: 22, margin: '14px 0 4px' }}>
              {user.username}
            </h2>
            {user.real_name && (
              <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 4 }}>
                真实姓名：{user.real_name}
              </div>
            )}
            <Tag color={role.color}>{role.label}</Tag>
          </div>
          {user.bio && (
            <Typography.Paragraph style={{ marginTop: 14, color: 'var(--ink-soft)', textAlign: 'center' }}>
              {user.bio}
            </Typography.Paragraph>
          )}
          <div style={{ marginTop: 16, color: 'var(--ink-soft)', fontSize: 13, lineHeight: 2 }}>
            <div>邮箱：{user.email || '未设置'}</div>
            <div>加入：{dayjs(user.date_joined).format('YYYY-MM-DD')}</div>
            <div>
              赛后公开代码：
              <Tag bordered={false} color={user.publicize_contest_code ? 'green' : 'default'}>
                {user.publicize_contest_code ? '已开启' : '未开启'}
              </Tag>
            </div>
          </div>
          <Button
            block
            icon={<SettingOutlined />}
            style={{ marginTop: 16 }}
            onClick={() => navigate('/settings')}
          >
            编辑资料与偏好
          </Button>
        </Card>

        {/* 右侧：统计 + 热力图 + 近期提交 */}
        <div>
          <Card className="card" bordered={false}>
            <div className="profile-stats">
              <Statistic title="通过题数" value={user.accepted_count} />
              <Statistic title="提交总数" value={user.submission_count} />
              <Statistic
                title={<Tooltip title="通过的提交数 ÷ 提交总数（按提交计，非按题计）">提交通过率</Tooltip>}
                value={subs === null ? '—' : rate}
                suffix={subs === null ? '' : '%'}
              />
            </div>
          </Card>

          <Card className="card" bordered={false} title="提交活跃度" style={{ marginTop: 18 }}>
            {subs === null ? <Spin /> : <SubmissionHeatmap data={heatData} />}
          </Card>

          <Card className="card" bordered={false} title="近期提交" style={{ marginTop: 18 }}>
            {subs === null ? (
              <Spin />
            ) : subs.length === 0 ? (
              <Empty description="还没有提交记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <div className="recent-subs">
                {subs.slice(0, 12).map((s) => (
                  <div className="recent-sub-row" key={s.id}>
                    <Link to={`/problems/${s.problem_display_id}`} className="mono recent-sub-pid">
                      #{s.problem_display_id}
                    </Link>
                    <VerdictTag status={s.status} />
                    <Tag bordered={false}>{s.language}</Tag>
                    <span style={{ flex: 1 }} />
                    <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                      {dayjs(s.created_at).format('MM-DD HH:mm')}
                    </span>
                  </div>
                ))}
                {count > subs.length && (
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginTop: 8 }}>
                    仅展示最近 {subs.length} 条（共 {count} 条提交）
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
