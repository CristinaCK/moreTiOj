import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Result,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { CopyOutlined, PlusOutlined, TrophyOutlined, UsergroupAddOutlined } from '@ant-design/icons'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import DifficultyTag from '../../components/DifficultyTag'
import { verdictOf } from '../../utils/verdict'
import { copyText } from '../../utils/clipboard'

export default function ClassDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [cls, setCls] = useState(null)
  const [failed, setFailed] = useState(false)
  const [members, setMembers] = useState(null)
  const [assignments, setAssignments] = useState(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignForm] = Form.useForm()

  // 批量加入
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchResult, setBatchResult] = useState(null)
  // 作业排行榜 / 学生提交
  const [boardFor, setBoardFor] = useState(null)
  const [board, setBoard] = useState(null)
  const [studentFor, setStudentFor] = useState(null) // {aid, user_id, name}
  const [studentData, setStudentData] = useState(null)

  const isTeacher = cls && cls.my_role === 'teacher'

  const fetchClass = useCallback(() => {
    api.getClass(id).then(setCls).catch(() => setFailed(true))
  }, [id])

  const fetchMembers = useCallback(() => {
    api
      .listClassMembers(id)
      .then((d) => setMembers(d.results || d || []))
      .catch(() => setMembers([]))
  }, [id])

  const fetchAssignments = useCallback(() => {
    api
      .listAssignments(id)
      .then((d) => setAssignments(d.results || d || []))
      .catch(() => setAssignments([]))
  }, [id])

  useEffect(() => {
    setCls(null)
    setFailed(false)
    fetchClass()
    fetchMembers()
    fetchAssignments()
  }, [fetchClass, fetchMembers, fetchAssignments])

  const copyInvite = async () => {
    if (!cls?.invite_code) return
    const ok = await copyText(cls.invite_code)
    if (ok) message.success('邀请码已复制')
    else message.info(`邀请码：${cls.invite_code}`)
  }

  const removeMember = async (userId) => {
    try {
      const res = await api.removeClassMember(id, userId)
      message.success(res.detail || '已移除')
      fetchMembers()
      fetchClass()
    } catch (e) {
      message.error(errMsg(e, '移除失败'))
    }
  }

  const createAssignment = async () => {
    const v = await assignForm.validateFields()
    const ids = v.problems
      .split(/[\s,，]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (ids.length === 0) {
      message.warning('请至少填写一个题号')
      return
    }
    try {
      await api.createAssignment(id, {
        title: v.title,
        problem_display_ids: ids,
        due_at: v.due_at ? v.due_at.toISOString() : null,
      })
      message.success('作业已布置，已通知全班')
      setAssignOpen(false)
      assignForm.resetFields()
      fetchAssignments()
    } catch (e) {
      message.error(errMsg(e, '布置失败'))
    }
  }

  const doBatchAdd = async () => {
    const usernames = batchText
      .split(/[\s,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (usernames.length === 0) {
      message.warning('请至少输入一个用户名')
      return
    }
    try {
      const res = await api.addClassMembers(id, usernames)
      setBatchResult(res)
      if (res.added_count > 0) {
        fetchMembers()
        fetchClass()
      }
    } catch (e) {
      message.error(errMsg(e, '批量加入失败'))
    }
  }

  const openBoard = async (a) => {
    setBoardFor(a)
    setBoard(null)
    try {
      const data = await api.getAssignmentLeaderboard(id, a.id)
      setBoard(data)
    } catch (e) {
      message.error(errMsg(e, '加载排行榜失败'))
      setBoardFor(null)
    }
  }

  const openStudent = async (aid, row) => {
    setStudentFor({ aid, user_id: row.user_id, name: row.name || row.user })
    setStudentData(null)
    try {
      const data = await api.getAssignmentStudentSubmissions(id, aid, row.user_id)
      setStudentData(data)
    } catch (e) {
      message.error(errMsg(e, '加载提交记录失败'))
      setStudentFor(null)
    }
  }

  if (failed) {
    return (
      <div className="page-container">
        <Result
          status="404"
          title="班级不存在或你不是该班成员"
          extra={<Link to="/classes"><Button>返回班级列表</Button></Link>}
        />
      </div>
    )
  }
  if (!cls) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  const memberColumns = [
    { title: '用户名', dataIndex: 'username', render: (v) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: '真实姓名', dataIndex: 'real_name', render: (v) => v || <span style={{ color: 'var(--ink-soft)' }}>—</span> },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (v) => <Tag bordered={false}>{v === 'assistant' ? '助教' : '学生'}</Tag>,
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      width: 170,
      className: 'mono',
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]
  if (isTeacher) {
    memberColumns.push({
      title: '操作',
      width: 90,
      render: (_, r) => (
        <Popconfirm title={`将 ${r.username} 移出班级？`} okText="移除" okButtonProps={{ danger: true }} onConfirm={() => removeMember(r.user_id)}>
          <Button type="link" size="small" danger>
            移除
          </Button>
        </Popconfirm>
      ),
    })
  }

  const overview = (
    <div>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'teacher', label: '任课教师', children: cls.teacher_name },
          { key: 'count', label: '成员人数', children: `${cls.member_count} 人` },
          { key: 'created', label: '创建时间', children: dayjs(cls.created_at).format('YYYY-MM-DD') },
        ]}
      />
      {cls.description && (
        <Typography.Paragraph style={{ marginTop: 12 }}>{cls.description}</Typography.Paragraph>
      )}
      {isTeacher && cls.invite_code && (
        <div className="invite-box">
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>班级邀请码（学生凭此加入）</div>
            <div className="mono invite-code">{cls.invite_code}</div>
          </div>
          <Button icon={<CopyOutlined />} onClick={copyInvite}>
            复制
          </Button>
        </div>
      )}
    </div>
  )

  const assignmentTab = (
    <div>
      {isTeacher && (
        <Button type="primary" ghost icon={<PlusOutlined />} style={{ marginBottom: 14 }} onClick={() => setAssignOpen(true)}>
          布置作业
        </Button>
      )}
      {assignments === null ? (
        <Spin />
      ) : assignments.length === 0 ? (
        <Empty description="暂无作业" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="assign-list">
          {assignments.map((a) => {
            const overdue = a.due_at && dayjs(a.due_at).isBefore(dayjs())
            return (
              <div className="assign-card" key={a.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{a.title}</span>
                  {a.due_at &&
                    (overdue ? (
                      <Tag color="default">已截止</Tag>
                    ) : (
                      <Tag color="green">进行中</Tag>
                    ))}
                  <span style={{ flex: 1 }} />
                  <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
                    {a.due_at ? `截止 ${dayjs(a.due_at).format('MM-DD HH:mm')}` : '无截止时间'}
                  </span>
                  <Button size="small" icon={<TrophyOutlined />} onClick={() => openBoard(a)}>
                    排行榜
                  </Button>
                </div>
                <div className="assign-problems">
                  {a.problems.map((p) => (
                    <Link
                      key={p.display_id}
                      to={`/problems/${p.display_id}?assignment=${a.id}&class=${id}`}
                      className="assign-problem"
                    >
                      <span className="mono">#{p.display_id}</span> {p.title}
                      <DifficultyTag value={p.difficulty} />
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="page-container">
      <Link to="/classes" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        ← 返回班级列表
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 18px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {cls.name}
        </h1>
        <Tag color={isTeacher ? 'green' : 'default'}>{isTeacher ? '我执教' : '学生'}</Tag>
      </div>

      <div className="card">
        <Tabs
          items={[
            { key: 'overview', label: '概览', children: overview },
            { key: 'assignments', label: '作业', children: assignmentTab },
            {
              key: 'members',
              label: `成员（${cls.member_count}）`,
              children:
                members === null ? (
                  <Spin />
                ) : (
                  <div>
                    {isTeacher && (
                      <Button
                        type="primary"
                        ghost
                        icon={<UsergroupAddOutlined />}
                        style={{ marginBottom: 14 }}
                        onClick={() => { setBatchResult(null); setBatchText(''); setBatchOpen(true) }}
                      >
                        批量加入学生
                      </Button>
                    )}
                    <Table rowKey="user_id" size="middle" columns={memberColumns} dataSource={members} pagination={false} />
                  </div>
                ),
            },
          ]}
        />
      </div>

      <Modal title="布置作业" open={assignOpen} onCancel={() => setAssignOpen(false)} onOk={createAssignment} okText="布置并通知全班" width={560}>
        <Form form={assignForm} layout="vertical">
          <Form.Item name="title" label="作业标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input maxLength={255} placeholder="如：第一周练习" />
          </Form.Item>
          <Form.Item
            name="problems"
            label="题号列表"
            rules={[{ required: true, message: '请输入至少一个题号' }]}
            extra="多个题号用空格或逗号分隔，如：1001 1002 1005"
          >
            <Input.TextArea rows={2} placeholder="1001, 1002, 1005" />
          </Form.Item>
          <Form.Item name="due_at" label="截止时间（可选）">
            <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量加入学生 */}
      <Modal
        title="批量加入学生"
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        onOk={doBatchAdd}
        okText="加入班级"
        width={520}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          输入学生的<strong>用户名</strong>，用空格、逗号或换行分隔（需先由管理员创建账号）。
        </Typography.Paragraph>
        <Input.TextArea
          rows={6}
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          placeholder={'2024001 2024002 2024003\n或每行一个用户名'}
          className="mono"
        />
        {batchResult && (
          <Alert
            style={{ marginTop: 12 }}
            type={batchResult.not_found?.length ? 'warning' : 'success'}
            showIcon
            message={`成功加入 ${batchResult.added_count} 人${batchResult.already?.length ? `，已在班 ${batchResult.already.length} 人` : ''}${batchResult.not_found?.length ? `，未找到 ${batchResult.not_found.length} 人` : ''}`}
            description={
              batchResult.not_found?.length ? (
                <div style={{ fontSize: 12 }}>未找到的用户名：{batchResult.not_found.join('、')}</div>
              ) : null
            }
          />
        )}
      </Modal>

      {/* 作业排行榜 */}
      <Drawer
        title={boardFor ? `作业排行榜 · ${boardFor.title}` : '作业排行榜'}
        width={Math.min(880, typeof window !== 'undefined' ? window.innerWidth - 40 : 880)}
        open={boardFor !== null}
        onClose={() => setBoardFor(null)}
      >
        {board === null ? (
          <Spin />
        ) : (
          <>
            {isTeacher && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                点击某行可查看该学生在本作业题目上的提交详情。
              </Typography.Paragraph>
            )}
            <Table
              rowKey="user_id"
              size="small"
              pagination={false}
              dataSource={board.rows}
              scroll={{ x: 'max-content' }}
              onRow={(row) => ({
                onClick: () => isTeacher && openStudent(boardFor.id, row),
                style: { cursor: isTeacher ? 'pointer' : 'default' },
              })}
              columns={[
                { title: '排名', dataIndex: 'rank', width: 56, align: 'center' },
                {
                  title: '选手',
                  dataIndex: 'name',
                  render: (v, r) => <span style={{ fontWeight: 600 }}>{v || r.user}</span>,
                },
                {
                  title: '解出',
                  width: 70,
                  align: 'center',
                  className: 'mono',
                  render: (_, r) => `${r.solved}/${r.total}`,
                },
                ...board.problems.map((p) => ({
                  title: <span className="mono">#{p.display_id}</span>,
                  key: p.display_id,
                  width: 48,
                  align: 'center',
                  render: (_, r) => {
                    const st = r.problems[p.display_id]
                    return (
                      <span className={`board-cell board-${st}`}>
                        {st === 'solved' ? '✓' : st === 'attempted' ? '·' : ''}
                      </span>
                    )
                  },
                })),
              ]}
            />
          </>
        )}
      </Drawer>

      {/* 学生提交详情（教师） */}
      <Drawer
        title={studentFor ? `${studentFor.name} 的提交` : '学生提交'}
        width={Math.min(760, typeof window !== 'undefined' ? window.innerWidth - 40 : 760)}
        open={studentFor !== null}
        onClose={() => setStudentFor(null)}
      >
        {studentData === null ? (
          <Spin />
        ) : studentData.submissions.length === 0 ? (
          <Empty description="该学生在本作业题目上还没有提交" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            dataSource={studentData.submissions}
            expandable={{
              expandedRowRender: (r) =>
                r.code ? (
                  <pre className="run-output mono" style={{ maxHeight: 320 }}>{r.code}</pre>
                ) : (
                  <span style={{ color: 'var(--ink-soft)' }}>（无源代码）</span>
                ),
              rowExpandable: (r) => !!r.code,
            }}
            columns={[
              {
                title: '题号',
                dataIndex: 'problem_display_id',
                width: 70,
                render: (v) => (
                  <Link to={`/problems/${v}`} className="mono">
                    #{v}
                  </Link>
                ),
              },
              {
                title: '结果',
                dataIndex: 'status',
                width: 96,
                render: (v) => {
                  const t = verdictOf(v)
                  return <Tag color={t.color}>{t.label}</Tag>
                },
              },
              { title: '得分', dataIndex: 'score', width: 60, align: 'center', className: 'mono' },
              { title: '用时', dataIndex: 'time_used', width: 80, align: 'center', className: 'mono', render: (v) => `${v} ms` },
              {
                title: '提交时间',
                dataIndex: 'created_at',
                className: 'mono',
                render: (v) => dayjs(v).format('MM-DD HH:mm'),
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  )
}
