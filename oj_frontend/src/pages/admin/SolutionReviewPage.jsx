import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Input, Modal, Result, Segmented, Space, Spin, Tag, message } from 'antd'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { hasPerm } from '../../utils/perm'
import MarkdownView from '../../components/MarkdownView'

const STATUS_TABS = [
  { value: 'pending', label: '待审核' },
  { value: 'published', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
]
const AUDIT_TAG = {
  pending: { label: '待审核', color: 'gold' },
  published: { label: '已通过', color: 'green' },
  rejected: { label: '已驳回', color: 'red' },
}

export default function SolutionReviewPage() {
  const { user } = useAuth()
  const [status, setStatus] = useState('pending')
  const [list, setList] = useState(null)
  const [expanded, setExpanded] = useState({}) // id -> detail|loading
  const [rejectFor, setRejectFor] = useState(null)
  const [reason, setReason] = useState('')

  const canReview = hasPerm(user, 'review_solution')

  const fetchList = useCallback(() => {
    if (!canReview) return
    setList(null)
    api
      .listSolutions({ status })
      .then((d) => setList(d.results || d || []))
      .catch(() => setList([]))
  }, [status, canReview])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  if (!canReview) {
    return (
      <div className="page-container">
        <Result status="403" title="没有题解审核权限" extra={<Link to="/"><Button>返回首页</Button></Link>} />
      </div>
    )
  }

  const toggleExpand = async (id) => {
    if (expanded[id]) {
      setExpanded((e) => {
        const n = { ...e }
        delete n[id]
        return n
      })
      return
    }
    setExpanded((e) => ({ ...e, [id]: { loading: true } }))
    try {
      const detail = await api.getSolution(id)
      setExpanded((e) => ({ ...e, [id]: detail }))
    } catch (err) {
      setExpanded((e) => ({ ...e, [id]: { error: true } }))
    }
  }

  const approve = async (id) => {
    try {
      await api.approveSolution(id)
      message.success('已通过')
      fetchList()
    } catch (e) {
      message.error(errMsg(e, '操作失败'))
    }
  }

  const doReject = async () => {
    try {
      await api.rejectSolution(rejectFor, reason)
      message.success('已驳回')
      setRejectFor(null)
      setReason('')
      fetchList()
    } catch (e) {
      message.error(errMsg(e, '操作失败'))
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>题解审核</h1>
        <span style={{ flex: 1 }} />
        {user?.is_admin && (
          <Link to="/admin">
            <Button>用户管理</Button>
          </Link>
        )}
      </div>

      <div className="card">
        <Segmented
          options={STATUS_TABS}
          value={status}
          onChange={setStatus}
          style={{ marginBottom: 14 }}
        />
        {list === null ? (
          <Spin />
        ) : list.length === 0 ? (
          <Empty description="该状态下暂无题解" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="reply-list">
            {list.map((s) => {
              const exp = expanded[s.id]
              return (
                <div key={s.id} className="review-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</span>
                    {AUDIT_TAG[s.audit_status] && (
                      <Tag color={AUDIT_TAG[s.audit_status].color}>{AUDIT_TAG[s.audit_status].label}</Tag>
                    )}
                    <Tag bordered={false}>{s.language}</Tag>
                    <Link to={`/problems/${s.problem_display_id}`} className="mono" style={{ fontSize: 13 }}>
                      #{s.problem_display_id}
                    </Link>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                      {s.author_name} · {dayjs(s.created_at).format('MM-DD HH:mm')}
                    </span>
                  </div>

                  {exp && exp.loading && <Spin style={{ marginTop: 8 }} />}
                  {exp && exp.content && (
                    <div className="review-content">
                      <MarkdownView>{exp.content}</MarkdownView>
                    </div>
                  )}

                  <Space style={{ marginTop: 10 }}>
                    <Button size="small" onClick={() => toggleExpand(s.id)}>
                      {exp ? '收起正文' : '查看正文'}
                    </Button>
                    {s.audit_status !== 'published' && (
                      <Button size="small" type="primary" onClick={() => approve(s.id)}>
                        通过
                      </Button>
                    )}
                    {s.audit_status !== 'rejected' && (
                      <Button size="small" danger onClick={() => setRejectFor(s.id)}>
                        驳回
                      </Button>
                    )}
                  </Space>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        title="驳回题解"
        open={rejectFor !== null}
        onCancel={() => {
          setRejectFor(null)
          setReason('')
        }}
        onOk={doReject}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="驳回理由（将通知作者，可留空）"
        />
      </Modal>
    </div>
  )
}
