import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Avatar,
  Button,
  Empty,
  Input,
  Popconfirm,
  Result,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import MarkdownView from '../../components/MarkdownView'

const AUDIT = {
  pending: { label: '待审核', color: 'gold' },
  rejected: { label: '已下架', color: 'red' },
}
const MAX_REPLY_PAGES = 10

export default function DiscussionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [topic, setTopic] = useState(null)
  const [failed, setFailed] = useState(false)
  const [replies, setReplies] = useState(null)
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState(null) // {id, author_name}
  const [posting, setPosting] = useState(false)
  const composerRef = useRef(null)

  const fetchTopic = useCallback(() => {
    api.getDiscussion(id).then(setTopic).catch(() => setFailed(true))
  }, [id])

  const fetchReplies = useCallback(async () => {
    const all = []
    try {
      let page = 1
      // 翻页拉取全部回复以便构建楼中楼
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const d = await api.listReplies(id, { page })
        const list = d.results || d || []
        all.push(...list)
        if (d.next && page < MAX_REPLY_PAGES) page += 1
        else break
      }
      setReplies(all)
    } catch (e) {
      setReplies([])
    }
  }, [id])

  useEffect(() => {
    setTopic(null)
    setFailed(false)
    setReplies(null)
    fetchTopic()
    fetchReplies()
  }, [fetchTopic, fetchReplies])

  const submit = async () => {
    if (!content.trim()) {
      message.warning('回复内容不能为空')
      return
    }
    setPosting(true)
    try {
      await api.createReply(id, { content, parent: replyTo?.id || null })
      setContent('')
      setReplyTo(null)
      await fetchReplies()
      fetchTopic()
    } catch (e) {
      message.error(errMsg(e, '回复失败'))
    } finally {
      setPosting(false)
    }
  }

  const onReplyTo = (reply) => {
    setReplyTo({ id: reply.id, author_name: reply.author_name })
    composerRef.current?.focus()
  }

  const removeReply = async (replyId) => {
    try {
      await api.deleteReply(replyId)
      message.success('已删除')
      await fetchReplies()
      fetchTopic()
    } catch (e) {
      message.error(errMsg(e, '删除失败'))
    }
  }

  const removeTopic = async () => {
    try {
      await api.deleteDiscussion(id)
      message.success('讨论已删除')
      navigate('/discussions')
    } catch (e) {
      message.error(errMsg(e, '删除失败'))
    }
  }

  const moderate = async (status) => {
    try {
      await api.moderateDiscussion(id, status)
      message.success('已处理')
      fetchTopic()
    } catch (e) {
      message.error(errMsg(e, '操作失败'))
    }
  }

  if (failed) {
    return (
      <div className="page-container">
        <Result
          status="404"
          title="讨论不存在或暂不可见"
          extra={<Link to="/discussions"><Button>返回讨论区</Button></Link>}
        />
      </div>
    )
  }
  if (!topic) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  const isMineOrAdmin = user && (user.is_admin || user.username === topic.author_name)
  const canReply = user && topic.audit_status === 'published'
  const tree = buildTree(replies || [])

  return (
    <div className="page-container" style={{ maxWidth: 920 }}>
      <Link to={topic.problem_display_id ? `/problems/${topic.problem_display_id}` : '/discussions'} style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        ← {topic.problem_display_id ? `返回题目 #${topic.problem_display_id}` : '返回讨论区'}
      </Link>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <h1 className="serif" style={{ fontSize: 24, margin: 0, flex: 1 }}>
            {topic.title}
          </h1>
          {AUDIT[topic.audit_status] && (
            <Tag color={AUDIT[topic.audit_status].color}>{AUDIT[topic.audit_status].label}</Tag>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px', color: 'var(--ink-soft)', fontSize: 13 }}>
          <Avatar size={22} icon={<UserOutlined />} style={{ background: 'var(--pine)' }} />
          <span>{topic.author_name}</span>
          <span>·</span>
          <span className="mono">{dayjs(topic.created_at).format('YYYY-MM-DD HH:mm')}</span>
          {topic.category && <Tag bordered={false}>{topic.category}</Tag>}
          {topic.problem_display_id && (
            <Tag bordered={false}>题目 #{topic.problem_display_id}</Tag>
          )}
          <span style={{ flex: 1 }} />
          <Space>
            {user?.is_admin &&
              (topic.audit_status === 'published' ? (
                <Button size="small" onClick={() => moderate('rejected')}>
                  下架
                </Button>
              ) : (
                <Button size="small" onClick={() => moderate('published')}>
                  恢复
                </Button>
              ))}
            {isMineOrAdmin && (
              <Popconfirm title="确认删除该讨论？" okText="删除" okButtonProps={{ danger: true }} onConfirm={removeTopic}>
                <Button size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        {topic.audit_status === 'rejected' && (
          <Tag color="red" style={{ margin: '8px 0' }}>
            该讨论已被下架，仅你与管理员可见。
          </Tag>
        )}

        <div style={{ marginTop: 12 }}>
          <MarkdownView>{topic.content}</MarkdownView>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-label" style={{ marginTop: 0 }}>
          <MessageOutlined /> 全部回复（{topic.reply_count}）
        </div>

        {replies === null ? (
          <Spin />
        ) : tree.length === 0 ? (
          <Empty description="还没有回复，来抢沙发" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="reply-list">
            {tree.map((floor, i) => (
              <ReplyFloor
                key={floor.id}
                floor={floor}
                index={i + 1}
                user={user}
                canReply={canReply}
                onReplyTo={onReplyTo}
                onRemove={removeReply}
              />
            ))}
          </div>
        )}

        {/* 回复编辑器 */}
        {canReply ? (
          <div className="reply-composer">
            {replyTo && (
              <div className="reply-target">
                回复 @{replyTo.author_name}
                <Button type="link" size="small" onClick={() => setReplyTo(null)}>
                  取消
                </Button>
              </div>
            )}
            <Input.TextArea
              ref={composerRef}
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="友善交流，支持 Markdown"
            />
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <Button type="primary" loading={posting} onClick={submit}>
                发表回复
              </Button>
            </div>
          </div>
        ) : !user ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            <Link to="/login">登录</Link> 后参与回复。
          </Typography.Paragraph>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            该讨论当前不可回复。
          </Typography.Paragraph>
        )}
      </div>
    </div>
  )
}

function ReplyFloor({ floor, index, user, canReply, onReplyTo, onRemove }) {
  return (
    <div className="reply-floor">
      <ReplyItem reply={floor} floorLabel={`${index} 楼`} user={user} canReply={canReply} onReplyTo={onReplyTo} onRemove={onRemove} />
      {floor.children.length > 0 && (
        <div className="reply-children">
          {floor.children.map((child) => (
            <ReplyItem
              key={child.id}
              reply={child}
              user={user}
              canReply={canReply}
              onReplyTo={onReplyTo}
              onRemove={onRemove}
              replyToName={child.parentName}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReplyItem({ reply, floorLabel, replyToName, user, canReply, onReplyTo, onRemove }) {
  const mine = user && (user.is_admin || user.username === reply.author_name)
  return (
    <div className="reply-item">
      <Avatar size={28} icon={<UserOutlined />} style={{ background: 'var(--pine)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="reply-head">
          <span style={{ fontWeight: 600 }}>{reply.author_name}</span>
          {floorLabel && <Tag bordered={false} style={{ marginLeft: 6 }}>{floorLabel}</Tag>}
          {replyToName && (
            <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
              {' '}回复 @{replyToName}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
            {dayjs(reply.created_at).format('MM-DD HH:mm')}
          </span>
        </div>
        <div className="reply-body">{reply.content}</div>
        <div className="reply-actions">
          {canReply && (
            <Button type="link" size="small" onClick={() => onReplyTo(reply)}>
              回复
            </Button>
          )}
          {mine && (
            <Popconfirm title="删除这条回复？" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => onRemove(reply.id)}>
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 把扁平回复整理为「楼 → 楼中楼」两级结构。
 * 任何非顶层回复都归到它的根楼层下，并记录其直接父级作者用于「回复 @X」展示。
 */
function buildTree(replies) {
  const byId = {}
  replies.forEach((r) => {
    byId[r.id] = r
  })
  const findRoot = (r) => {
    let cur = r
    const seen = new Set()
    while (cur.parent_id && byId[cur.parent_id] && !seen.has(cur.id)) {
      seen.add(cur.id)
      cur = byId[cur.parent_id]
    }
    return cur
  }
  const floors = []
  const floorMap = {}
  replies
    .filter((r) => !r.parent_id)
    .forEach((r) => {
      const node = { ...r, children: [] }
      floorMap[r.id] = node
      floors.push(node)
    })
  replies
    .filter((r) => r.parent_id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach((r) => {
      const root = findRoot(r)
      const floor = floorMap[root.id]
      if (!floor) return
      const parent = byId[r.parent_id]
      floor.children.push({
        ...r,
        parentName: parent && parent.id !== root.id ? parent.author_name : null,
      })
    })
  return floors
}
