import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Descriptions,
  Empty,
  Input,
  Modal,
  Result,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { ClockCircleOutlined, TrophyOutlined } from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import DifficultyTag from '../../components/DifficultyTag'
import MarkdownView from '../../components/MarkdownView'
import { CONTEST_STATUS, durationText, formatCountdown, ruleLabel, visibilityLabel } from '../../utils/contest'
import Leaderboard from './Leaderboard'
import ContestManagePanel from './ContestManagePanel'

export default function ContestDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [contest, setContest] = useState(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState('overview')
  const [, setTick] = useState(0) // 仅用于驱动倒计时重渲染

  const [board, setBoard] = useState(null)
  const [boardErr, setBoardErr] = useState('')
  const boardTimer = useRef(null)

  const [pwModal, setPwModal] = useState({ open: false, password: '' })

  const fetchContest = useCallback(() => {
    api.getContest(id).then(setContest).catch(() => setFailed(true))
  }, [id])

  useEffect(() => {
    setContest(null)
    setFailed(false)
    fetchContest()
  }, [fetchContest])

  // 每秒驱动倒计时
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const loadBoard = useCallback(() => {
    api
      .getLeaderboard(id)
      .then((d) => {
        setBoard(d)
        setBoardErr('')
      })
      .catch((e) => setBoardErr(errMsg(e, '排行榜暂不可用')))
  }, [id])

  // 切到排行榜 tab 时加载；竞赛进行中每 20s 自动刷新
  useEffect(() => {
    if (tab !== 'leaderboard') {
      if (boardTimer.current) clearInterval(boardTimer.current)
      return undefined
    }
    loadBoard()
    if (contest?.status === 'running') {
      boardTimer.current = setInterval(loadBoard, 20000)
    }
    return () => {
      if (boardTimer.current) clearInterval(boardTimer.current)
    }
  }, [tab, contest?.status, loadBoard])

  const doRegister = async (password) => {
    try {
      const res = await api.registerContest(contest.id, password)
      message.success(res.detail || '报名成功')
      setPwModal({ open: false, password: '' })
      fetchContest()
    } catch (e) {
      message.error(errMsg(e, '报名失败'))
    }
  }

  const onRegister = () => {
    if (!user) {
      message.warning('请先登录')
      navigate('/login', { state: { from: `/contests/${id}` } })
      return
    }
    if (contest.visibility === 'password') setPwModal({ open: true, password: '' })
    else doRegister()
  }

  if (failed) {
    return (
      <div className="page-container">
        <Result status="404" title="竞赛不存在或你暂无权限查看" extra={<Link to="/contests"><Button>返回竞赛列表</Button></Link>} />
      </div>
    )
  }
  if (!contest) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  const st = CONTEST_STATUS[contest.status] || {}
  const countdownTarget = contest.status === 'upcoming' ? contest.start_time : contest.end_time
  const countdownLabel = contest.status === 'upcoming' ? '距开始' : contest.status === 'running' ? '距结束' : ''
  const canRegister = !contest.is_registered && contest.status !== 'ended' && contest.visibility !== 'private'

  const problemColumns = [
    { title: '序号', dataIndex: 'label', width: 70, className: 'mono', render: (v) => <strong>{v}</strong> },
    {
      title: '题目',
      dataIndex: 'title',
      render: (v, r) => (
        <Link to={`/contests/${contest.id}/problems/${r.display_id}`} style={{ fontWeight: 500 }}>
          {v}
        </Link>
      ),
    },
    { title: '难度', dataIndex: 'difficulty', width: 90, render: (v) => <DifficultyTag value={v} /> },
    { title: '分值', dataIndex: 'score', width: 80, className: 'mono' },
  ]

  const problemsTab = () => {
    if ((contest.problems || []).length > 0) {
      return <Table rowKey="label" size="middle" columns={problemColumns} dataSource={contest.problems} pagination={false} />
    }
    if (contest.status === 'upcoming') {
      return <Empty description="竞赛尚未开始，赛题将于开赛后开放" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    }
    if (!contest.is_registered) {
      return (
        <Empty description="报名并在竞赛开始后查看赛题" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          {canRegister && <Button type="primary" onClick={onRegister}>立即报名</Button>}
        </Empty>
      )
    }
    return <Empty description="本场竞赛暂无赛题" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const items = [
    {
      key: 'overview',
      label: '竞赛说明',
      children: (
        <div>
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            size="small"
            style={{ marginBottom: 18 }}
            items={[
              { key: 'rule', label: '赛制', children: ruleLabel(contest.rule_type) },
              { key: 'vis', label: '可见性', children: visibilityLabel(contest.visibility) },
              { key: 'start', label: '开始', children: dayjs(contest.start_time).format('YYYY-MM-DD HH:mm') },
              { key: 'end', label: '结束', children: dayjs(contest.end_time).format('YYYY-MM-DD HH:mm') },
              { key: 'dur', label: '时长', children: durationText(contest.start_time, contest.end_time) },
              {
                key: 'pen',
                label: contest.rule_type === 'acm' ? '单次罚时' : '记分方式',
                children: contest.rule_type === 'acm' ? `${contest.penalty_minutes} 分钟` : '取各题最高分之和',
              },
              {
                key: 'freeze',
                label: '封榜',
                children: contest.freeze_minutes ? `结束前 ${contest.freeze_minutes} 分钟` : '不封榜',
              },
            ]}
          />
          {contest.description ? (
            <MarkdownView>{contest.description}</MarkdownView>
          ) : (
            <Typography.Text type="secondary">出题人未填写竞赛说明。</Typography.Text>
          )}
        </div>
      ),
    },
    { key: 'problems', label: '赛题', children: problemsTab() },
    {
      key: 'leaderboard',
      label: '排行榜',
      children: boardErr ? (
        <Empty description={boardErr} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : board ? (
        <div>
          {board.frozen && (
            <Tag color="gold" style={{ marginBottom: 12 }}>
              榜单已封禁 · 封榜后的提交仅显示尝试次数，竞赛结束自动解榜
            </Tag>
          )}
          <Leaderboard data={board} contestId={id} />
        </div>
      ) : (
        <Spin />
      ),
    },
  ]

  if (user?.is_teacher) {
    items.push({
      key: 'manage',
      label: '管理',
      children: <ContestManagePanel contest={contest} onChanged={fetchContest} />,
    })
  }

  return (
    <div className="page-container">
      <Link to="/contests" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        ← 返回竞赛列表
      </Link>

      <div className="card contest-hero">
        <div className="contest-hero-main">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <TrophyOutlined style={{ color: 'var(--gold)', fontSize: 22 }} />
            <h1 className="contest-hero-title">{contest.title}</h1>
            <Tag color={st.color}>{st.label}</Tag>
            <Tag bordered={false}>{contest.rule_type === 'acm' ? 'ACM' : 'OI'}</Tag>
          </div>
          <div className="contest-hero-meta">
            <span>{dayjs(contest.start_time).format('MM-DD HH:mm')} ～ {dayjs(contest.end_time).format('MM-DD HH:mm')}</span>
            <span>·</span>
            <span>{durationText(contest.start_time, contest.end_time)}</span>
            <span>·</span>
            <span>{contest.participant_count} 人参赛</span>
          </div>
        </div>
        <div className="contest-hero-side">
          {countdownLabel && (
            <div className="countdown">
              <div className="countdown-label">
                <ClockCircleOutlined /> {countdownLabel}
              </div>
              <div className="countdown-value mono">{formatCountdown(countdownTarget)}</div>
            </div>
          )}
          {contest.is_registered ? (
            <Tag color="success" style={{ marginTop: 8 }}>已报名</Tag>
          ) : canRegister ? (
            <Button type="primary" onClick={onRegister} style={{ marginTop: 8 }}>
              报名参赛
            </Button>
          ) : contest.visibility === 'private' ? (
            <Tag style={{ marginTop: 8 }}>定向邀请赛</Tag>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <Tabs activeKey={tab} onChange={setTab} items={items} />
      </div>

      <Modal
        title={`报名：${contest.title}`}
        open={pwModal.open}
        onCancel={() => setPwModal({ open: false, password: '' })}
        onOk={() => doRegister(pwModal.password)}
        okText="确认报名"
      >
        <Input.Password
          placeholder="请输入报名密码"
          value={pwModal.password}
          onChange={(e) => setPwModal({ open: true, password: e.target.value })}
        />
      </Modal>
    </div>
  )
}
