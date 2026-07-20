import { Empty, Table, Tooltip } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

/**
 * 排行榜表格。data 形如：
 *   { rule_type, labels: ['A','B'], frozen: bool, rows: [...] }
 * ACM 行：{ rank, user, solved, penalty, problems: { A: {solved,wrong,ac_minutes,frozen_attempts?} } }
 * OI  行：{ rank, user, score, time, problems: { A: {score, frozen_attempts?} } }
 */
export default function Leaderboard({ data, contestId }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!data || !data.rows) return null
  const isACM = data.rule_type === 'acm'
  // 管理员可点击选手姓名，跳到其在本竞赛的测评记录
  const canInspect = Boolean(contestId) && Boolean(user?.is_admin)

  const rankCell = (rank) => {
    const cls = rank <= 3 ? `rank-medal rank-${rank}` : 'rank-num'
    return <span className={cls}>{rank}</span>
  }

  const problemColumns = (data.labels || []).map((label) => ({
    title: label,
    key: label,
    width: 78,
    align: 'center',
    render: (_, row) => {
      const cell = row.problems?.[label]
      const did = data.problem_ids?.[label]
      const active = cell && (cell.solved || cell.wrong || (cell.score || 0) > 0 || cell.frozen_attempts)
      if (canInspect && did && active) {
        return (
          <span
            style={{ cursor: 'pointer' }}
            title="查看该选手此题的提交记录"
            onClick={() =>
              navigate(
                `/admin/submissions?contest=${contestId}&username=${encodeURIComponent(row.user)}&problem=${did}`
              )
            }
          >
            <Cell cell={cell} isACM={isACM} />
          </span>
        )
      }
      return <Cell cell={cell} isACM={isACM} />
    },
  }))

  const columns = [
    { title: '排名', dataIndex: 'rank', width: 64, align: 'center', render: rankCell },
    {
      title: '选手',
      dataIndex: 'name',
      render: (v, row) =>
        canInspect ? (
          <a
            style={{ fontWeight: 600 }}
            onClick={() =>
              navigate(`/admin/submissions?contest=${contestId}&username=${encodeURIComponent(row.user)}`)
            }
          >
            {v || row.user}
          </a>
        ) : (
          <span style={{ fontWeight: 600 }}>{v || row.user}</span>
        ),
    },
    isACM
      ? { title: '解题', dataIndex: 'solved', width: 70, align: 'center', className: 'mono' }
      : { title: '总分', dataIndex: 'score', width: 80, align: 'center', className: 'mono' },
    isACM
      ? {
          title: '罚时',
          dataIndex: 'penalty',
          width: 90,
          align: 'center',
          className: 'mono',
          render: (v) => <span style={{ color: 'var(--ink-soft)' }}>{v}</span>,
        }
      : {
          title: '用时',
          dataIndex: 'time',
          width: 90,
          align: 'center',
          className: 'mono',
          render: (v) => <span style={{ color: 'var(--ink-soft)' }}>{v} ms</span>,
        },
    ...problemColumns,
  ]

  if (data.rows.length === 0) {
    return <Empty description="暂无参赛选手提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Table
      className="scoreboard"
      rowKey="user"
      size="small"
      bordered
      columns={columns}
      dataSource={data.rows}
      pagination={false}
      rowClassName={(row) => (user && row.user === user.username ? 'me-row' : '')}
      scroll={{ x: 'max-content' }}
    />
  )
}

function Cell({ cell, isACM }) {
  if (!cell) return <span style={{ color: 'var(--line)' }}>·</span>

  if (isACM) {
    if (cell.solved) {
      const tries = (cell.wrong || 0) + 1
      return (
        <Tooltip title={`第 ${cell.ac_minutes} 分钟通过，共 ${tries} 次提交`}>
          <div className="sb-cell sb-ac">
            <div className="sb-main">+{cell.wrong ? cell.wrong : ''}</div>
            <div className="sb-sub mono">{cell.ac_minutes}</div>
          </div>
        </Tooltip>
      )
    }
    if (cell.frozen_attempts) {
      return (
        <Tooltip title="封榜期间的提交，结果暂不公开">
          <div className="sb-cell sb-frozen">
            <div className="sb-main">?</div>
            <div className="sb-sub mono">{cell.frozen_attempts}</div>
          </div>
        </Tooltip>
      )
    }
    if (cell.wrong) {
      return (
        <div className="sb-cell sb-wrong">
          <div className="sb-main">−{cell.wrong}</div>
        </div>
      )
    }
    return <span style={{ color: 'var(--line)' }}>·</span>
  }

  // OI：按得分着色
  const score = cell.score || 0
  let cls = 'sb-zero'
  if (cell.frozen_attempts && score === 0) {
    return (
      <Tooltip title="封榜期间的提交，结果暂不公开">
        <div className="sb-cell sb-frozen">
          <div className="sb-main">?</div>
        </div>
      </Tooltip>
    )
  }
  if (score >= 100) cls = 'sb-full'
  else if (score > 0) cls = 'sb-partial'
  return (
    <div className={`sb-cell ${cls}`}>
      <div className="sb-main mono">{score}</div>
    </div>
  )
}
