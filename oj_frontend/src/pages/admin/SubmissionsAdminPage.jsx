import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Empty, Input, Result, Select, Space, Spin, Table, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import VerdictTag from '../../components/VerdictTag'
import ResultPanel from '../solve/ResultPanel'
import { VERDICTS } from '../../utils/verdict'

// 供筛选的评测状态（排除“已提交/封存”这种仅前端用的占位态）
const STATUS_OPTIONS = Object.entries(VERDICTS)
  .filter(([k]) => !['sealed', 'pending', 'judging'].includes(k))
  .map(([value, v]) => ({ value, label: v.label }))

export default function SubmissionsAdminPage() {
  const { user } = useAuth()
  const [sp, setSp] = useSearchParams()

  // 原始输入（不直接触发查询，点“查询”或回车才应用）
  const [username, setUsername] = useState(sp.get('username') || '')
  const [problem, setProblem] = useState(sp.get('problem') || '')
  const [statusF, setStatusF] = useState(sp.get('status') || '')
  // 已应用的筛选条件
  const [applied, setApplied] = useState({
    username: sp.get('username') || '',
    problem: sp.get('problem') || '',
    status: sp.get('status') || '',
  })
  const contestId = sp.get('contest') || ''
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null) // { loading, ...submission }

  const fetchData = useCallback(() => {
    if (!user?.is_admin) return
    const params = { page }
    if (applied.username.trim()) params.username = applied.username.trim()
    if (applied.problem.trim()) params.problem = applied.problem.trim()
    if (applied.status) params.status = applied.status
    if (contestId) params.contest = contestId
    setData(null)
    api
      .listSubmissions(params)
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
  }, [user, page, applied, contestId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (!user?.is_admin) {
    return (
      <div className="page-container">
        <Result status="403" title="仅管理员可查看测评记录" />
      </div>
    )
  }

  const search = () => {
    setApplied({ username, problem, status: statusF })
    setPage(1)
  }

  const openDetail = async (record) => {
    setDetail({ loading: true })
    try {
      const d = await api.getSubmission(record.id)
      setDetail({ ...d, loading: false })
    } catch (e) {
      setDetail(null)
    }
  }

  const clearContest = () => {
    const n = new URLSearchParams(sp)
    n.delete('contest')
    setSp(n)
    setPage(1)
  }

  const columns = [
    {
      title: '用户',
      dataIndex: 'name',
      render: (v, r) => (
        <span>
          <b>{v || r.username}</b>
          {v && v !== r.username && (
            <span style={{ color: 'var(--ink-soft)', marginLeft: 6, fontSize: 12 }}>{r.username}</span>
          )}
        </span>
      ),
    },
    { title: '题号', dataIndex: 'problem_display_id', width: 96 },
    {
      title: '来源',
      dataIndex: 'source',
      width: 170,
      render: (v) => v || <span style={{ color: 'var(--ink-soft)' }}>—</span>,
    },
    {
      title: '结果',
      dataIndex: 'status',
      width: 120,
      render: (s, r) => (
        <span>
          <VerdictTag status={s} />
          {r.first_failed_index != null && (
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>#{r.first_failed_index}</span>
          )}
        </span>
      ),
    },
    {
      title: '用时',
      dataIndex: 'time_used',
      width: 88,
      render: (v) => (v == null ? '—' : `${v} ms`),
    },
    {
      title: '内存',
      dataIndex: 'memory_used',
      width: 88,
      render: (kb) => (kb == null ? '—' : `${Math.round((kb || 0) / 1024)} MB`),
    },
    { title: '语言', dataIndex: 'language', width: 84, render: (v) => <Tag bordered={false}>{v}</Tag> },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
  ]

  return (
    <div className="page-container">
      <h1 className="page-title">测评记录</h1>

      {contestId && (
        <div style={{ marginBottom: 12 }}>
          <Tag color="blue" closable onClose={clearContest}>
            仅显示竞赛 #{contestId} 的提交
          </Tag>
        </div>
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="用户名"
          allowClear
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onPressEnter={search}
          style={{ width: 160 }}
        />
        <Input
          placeholder="题号（如 00001）"
          allowClear
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          onPressEnter={search}
          style={{ width: 170 }}
        />
        <Select
          placeholder="结果（全部）"
          allowClear
          value={statusF || undefined}
          onChange={(v) => setStatusF(v || '')}
          options={STATUS_OPTIONS}
          style={{ width: 160 }}
        />
        <Button type="primary" onClick={search}>
          查询
        </Button>
      </Space>

      {data === null ? (
        <Spin />
      ) : (
        <Table
          size="small"
          rowKey="id"
          dataSource={data.results}
          columns={columns}
          onRow={(record) => ({ onClick: () => openDetail(record), className: 'clickable-row' })}
          pagination={{
            current: page,
            total: data.count,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
          locale={{
            emptyText: <Empty description="没有符合条件的提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <Drawer title="提交详情" width={720} open={Boolean(detail)} onClose={() => setDetail(null)}>
        {detail?.loading ? (
          <Spin />
        ) : (
          detail && (
            <>
              <ResultPanel submission={detail} />
              {detail.code && (
                <>
                  <div className="section-label">源代码</div>
                  <pre
                    className="mono"
                    style={{
                      background: '#f7f6f1',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      overflow: 'auto',
                    }}
                  >
                    {detail.code}
                  </pre>
                </>
              )}
            </>
          )
        )}
      </Drawer>
    </div>
  )
}
