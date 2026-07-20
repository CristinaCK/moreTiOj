import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Drawer, Empty, Result, Select, Spin, Tabs, Tag } from 'antd'
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  LeftOutlined,
  RightOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'
import { CONTEST_STATUS, formatCountdown } from '../../utils/contest'
import Leaderboard from '../contest/Leaderboard'
import DescriptionPanel from './DescriptionPanel'
import EditorPanel from './EditorPanel'
import ClozePanel from './ClozePanel'
import SolutionsPanel from './SolutionsPanel'
import SubmissionsPanel from './SubmissionsPanel'

export default function ProblemSolvePage() {
  // 同时服务普通做题（/problems/:displayId）与赛内做题（/contests/:contestId/problems/:displayId）
  const { displayId, contestId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const aid = searchParams.get('assignment')
  const cid = searchParams.get('class')
  const [problem, setProblem] = useState(null)
  const [failed, setFailed] = useState(false)
  const [contest, setContest] = useState(null)
  const [assignmentNav, setAssignmentNav] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    setProblem(null)
    setFailed(false)
    api.getProblem(displayId).then(setProblem).catch(() => setFailed(true))
  }, [displayId])

  // 作业上下文：拉取该作业的题目列表，支持上一题/下一题
  useEffect(() => {
    if (!aid || !cid) {
      setAssignmentNav(null)
      return
    }
    api
      .listAssignments(cid)
      .then((d) => {
        const list = d.results || d || []
        const a = list.find((x) => String(x.id) === String(aid))
        setAssignmentNav(a ? { title: a.title, problems: a.problems || [] } : null)
      })
      .catch(() => setAssignmentNav(null))
  }, [aid, cid])

  useEffect(() => {
    if (!contestId) {
      setContest(null)
      return
    }
    api.getContest(contestId).then(setContest).catch(() => setContest(null))
  }, [contestId])

  // 赛内：每秒驱动倒计时
  useEffect(() => {
    if (!contestId) return undefined
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [contestId])

  const onJudged = useCallback(() => setRefreshKey((k) => k + 1), [])

  if (failed) {
    return (
      <div className="page-container">
        <Result
          status="404"
          title="题目不存在或暂不可见"
          subTitle={
            contestId
              ? '请确认你已报名本场竞赛、且竞赛已开始；若仍打不开，请联系出题人确认该题已加入本场竞赛。'
              : undefined
          }
          extra={
            contestId ? (
              <Link to={`/contests/${contestId}`}>
                <Button>返回竞赛</Button>
              </Link>
            ) : (
              <Link to="/problems">
                <Button>返回题库</Button>
              </Link>
            )
          }
        />
      </div>
    )
  }
  if (!problem) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  const contestRunning = contest?.status === 'running'

  // 作业导航条
  let navBar = null
  if (assignmentNav && assignmentNav.problems.length > 0) {
    const probs = assignmentNav.problems
    const idx = probs.findIndex((p) => p.display_id === displayId)
    const goTo = (did) => navigate(`/problems/${did}?assignment=${aid}&class=${cid}`)
    navBar = (
      <div className="assign-navbar">
        <Link to={`/classes/${cid}`} style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
          <ArrowLeftOutlined /> 返回班级
        </Link>
        <span className="assign-navbar-title">作业：{assignmentNav.title}</span>
        <span style={{ flex: 1 }} />
        <Button size="small" icon={<LeftOutlined />} disabled={idx <= 0} onClick={() => goTo(probs[idx - 1].display_id)}>
          上一题
        </Button>
        <Select
          size="small"
          style={{ width: 220 }}
          value={idx >= 0 ? displayId : undefined}
          placeholder="跳转到本作业其它题"
          onChange={goTo}
          options={probs.map((p, i) => ({ value: p.display_id, label: `${i + 1}. ${p.title}` }))}
        />
        <Button
          size="small"
          icon={<RightOutlined />}
          disabled={idx < 0 || idx >= probs.length - 1}
          onClick={() => goTo(probs[idx + 1].display_id)}
        >
          下一题
        </Button>
      </div>
    )
  }

  return (
    <div>
      {navBar}
      {contestId && contest && (
        <ContestBar contest={contest} contestId={contestId} displayId={displayId} navigate={navigate} />
      )}
      <div className={`solve-page${contestId ? ' solve-page--contest' : ''}`}>
        <div className="solve-left">
          <Tabs
            defaultActiveKey="description"
            items={[
              { key: 'description', label: '题目描述', children: <DescriptionPanel problem={problem} /> },
              { key: 'solutions', label: '题解', children: <SolutionsPanel problem={problem} /> },
              {
                key: 'submissions',
                label: '提交记录',
                children: <SubmissionsPanel problem={problem} refreshKey={refreshKey} />,
              },
            ]}
          />
        </div>
        <div className="solve-right">
          {problem.problem_type === 'cloze' ? (
            <ClozePanel
              problem={problem}
              onJudged={onJudged}
              contestId={contestId}
              contestRunning={contestRunning}
            />
          ) : (
            <EditorPanel
              problem={problem}
              onJudged={onJudged}
              contestId={contestId}
              contestRunning={contestRunning}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ContestBar({ contest, contestId, displayId, navigate }) {
  const st = CONTEST_STATUS[contest.status] || {}
  const target = contest.status === 'upcoming' ? contest.start_time : contest.end_time
  const label = contest.status === 'upcoming' ? '距开始' : contest.status === 'running' ? '距结束' : '已结束'

  // 赛题切换（参考力扣：上一题 / 下拉选择 / 下一题）
  const problems = contest.problems || []
  const idx = problems.findIndex((p) => p.display_id === displayId)
  const goTo = (did) => navigate(`/contests/${contestId}/problems/${did}`)

  // 赛内排行榜抽屉：点开即拉取，进行中每 20s 自动刷新
  const [boardOpen, setBoardOpen] = useState(false)
  const [board, setBoard] = useState(null)
  const [boardErr, setBoardErr] = useState('')
  const timer = useRef(null)

  const loadBoard = useCallback(() => {
    api
      .getLeaderboard(contestId)
      .then((d) => {
        setBoard(d)
        setBoardErr('')
      })
      .catch((e) => setBoardErr(errMsg(e, '排行榜暂不可用')))
  }, [contestId])

  useEffect(() => {
    if (!boardOpen) {
      if (timer.current) clearInterval(timer.current)
      return undefined
    }
    loadBoard()
    if (contest.status === 'running') timer.current = setInterval(loadBoard, 20000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [boardOpen, contest.status, loadBoard])

  const drawerWidth =
    typeof window !== 'undefined' ? Math.min(900, Math.max(360, window.innerWidth - 80)) : 900

  return (
    <div className="contest-bar">
      <Link to={`/contests/${contestId}`} className="contest-bar-back">
        <ArrowLeftOutlined /> {contest.title}
      </Link>
      <Tag color={st.color} style={{ marginLeft: 4 }}>
        {st.label}
      </Tag>

      {problems.length > 0 && (
        <span className="contest-bar-switcher" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 12 }}>
          <Button
            size="small"
            type="text"
            icon={<LeftOutlined />}
            title="上一题"
            disabled={idx <= 0}
            onClick={() => goTo(problems[idx - 1].display_id)}
          />
          <Select
            size="small"
            style={{ width: 240 }}
            value={idx >= 0 ? displayId : undefined}
            placeholder="选择赛题"
            onChange={goTo}
            options={problems.map((p) => ({ value: p.display_id, label: `${p.label}. ${p.title}` }))}
          />
          <Button
            size="small"
            type="text"
            icon={<RightOutlined />}
            title="下一题"
            disabled={idx < 0 || idx >= problems.length - 1}
            onClick={() => goTo(problems[idx + 1].display_id)}
          />
        </span>
      )}

      <span style={{ flex: 1 }} />

      {contest.status !== 'ended' && (
        <span className="contest-bar-timer mono">
          <ClockCircleOutlined /> {label} {formatCountdown(target)}
        </span>
      )}

      <Button
        size="small"
        type="text"
        icon={<TrophyOutlined />}
        style={{ marginLeft: 12 }}
        onClick={() => setBoardOpen(true)}
      >
        排行榜
      </Button>

      <Drawer
        title={`${contest.title} · 排行榜`}
        placement="right"
        width={drawerWidth}
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        extra={
          <Link to={`/contests/${contestId}`} onClick={() => setBoardOpen(false)}>
            完整竞赛页 →
          </Link>
        }
      >
        {boardErr ? (
          <Empty description={boardErr} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : board ? (
          <div>
            {board.frozen && (
              <Tag color="gold" style={{ marginBottom: 12 }}>
                榜单已封禁 · 封榜后的提交仅显示尝试次数，竞赛结束自动解榜
              </Tag>
            )}
            {contest.status === 'running' && (
              <div style={{ marginBottom: 10, color: 'var(--ink-soft)', fontSize: 12 }}>每 20 秒自动刷新</div>
            )}
            <Leaderboard data={board} contestId={contestId} />
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <Spin />
          </div>
        )}
      </Drawer>
    </div>
  )
}
