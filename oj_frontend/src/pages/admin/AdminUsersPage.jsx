import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Result,
  Select,
  Switch,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { PlusOutlined, UsergroupAddOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'

const ROLE_OPTIONS = [
  { value: 'user', label: '学生' },
  { value: 'teacher', label: '教师' },
  { value: 'admin', label: '管理员' },
]

export default function AdminUsersPage() {
  const { user } = useAuth()
  const [data, setData] = useState({ results: [], count: 0 })
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm()
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchResult, setBatchResult] = useState(null)
  const [pwFor, setPwFor] = useState(null) // {id, username}
  const [pwForm] = Form.useForm()

  const fetchUsers = useCallback(() => {
    setLoading(true)
    api
      .listAdminUsers({ page, search: search || undefined })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => {
    if (user?.is_admin) api.getPermissionCatalog().then(setCatalog).catch(() => {})
  }, [user])

  useEffect(() => {
    if (user?.is_admin) fetchUsers()
  }, [fetchUsers, user])

  if (!user?.is_admin) {
    return (
      <div className="page-container">
        <Result status="403" title="仅管理员可进入后台" extra={<Link to="/"><Button>返回首页</Button></Link>} />
      </div>
    )
  }

  const patchUser = async (id, payload) => {
    try {
      const updated = await api.updateAdminUser(id, payload)
      setData((d) => ({ ...d, results: d.results.map((u) => (u.id === id ? updated : u)) }))
      message.success('已更新')
    } catch (e) {
      message.error(errMsg(e, '更新失败'))
      fetchUsers()
    }
  }

  const togglePerm = (record, key, checked) => {
    const cur = record.granted_permissions || []
    const next = checked ? [...new Set([...cur, key])] : cur.filter((k) => k !== key)
    patchUser(record.id, { granted_permissions: next })
  }

  const doCreate = async () => {
    const v = await createForm.validateFields()
    try {
      await api.createAdminUser(v)
      message.success('账号已创建')
      setCreateOpen(false)
      createForm.resetFields()
      fetchUsers()
    } catch (e) {
      message.error(errMsg(e, '创建失败'))
    }
  }

  const doBatch = async () => {
    const users = batchText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [username, password, real_name = '', role = 'user'] = line.split(/[,，\t]/).map((x) => x.trim())
        return { username, password, real_name, role: role || 'user' }
      })
    if (users.length === 0) {
      message.warning('请至少输入一行')
      return
    }
    try {
      const res = await api.batchCreateAdminUsers(users)
      setBatchResult(res)
      if (res.created_count > 0) fetchUsers()
    } catch (e) {
      message.error(errMsg(e, '批量创建失败'))
    }
  }

  const doResetPw = async () => {
    const { password } = await pwForm.validateFields()
    try {
      await api.setAdminUserPassword(pwFor.id, password)
      message.success(`已重置 ${pwFor.username} 的密码`)
      setPwFor(null)
      pwForm.resetFields()
    } catch (e) {
      message.error(errMsg(e, '重置失败'))
    }
  }

  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      width: 150,
      fixed: 'left',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.email || '无邮箱'}</div>
        </div>
      ),
    },
    { title: '真实姓名', dataIndex: 'real_name', width: 110, render: (v) => v || <span style={{ color: 'var(--ink-soft)' }}>—</span> },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
      render: (v, r) => {
        const isSelf = r.id === user.id
        return (
          <Tooltip title={isSelf ? '不能修改自己的角色' : ''}>
            <Select
              size="small"
              value={v}
              disabled={isSelf}
              style={{ width: 90 }}
              options={ROLE_OPTIONS}
              onChange={(role) => patchUser(r.id, { role })}
            />
          </Tooltip>
        )
      },
    },
    ...catalog.map((p) => ({
      title: p.label.replace(/（.*）/, ''),
      key: p.key,
      width: 100,
      align: 'center',
      render: (_, r) => {
        const adminAll = r.role === 'admin'
        const checked = adminAll || (r.granted_permissions || []).includes(p.key)
        return (
          <Tooltip title={adminAll ? '管理员默认拥有全部权限' : p.label}>
            <Switch size="small" checked={checked} disabled={adminAll} onChange={(c) => togglePerm(r, p.key, c)} />
          </Tooltip>
        )
      },
    })),
    {
      title: '注册',
      dataIndex: 'date_joined',
      width: 100,
      className: 'mono',
      render: (v) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      render: (_, r) => (
        <Button size="small" onClick={() => setPwFor({ id: r.id, username: r.username })}>
          重置密码
        </Button>
      ),
    },
  ]

  return (
    <div className="page-container">
      <h1 className="page-title">管理后台 · 用户管理</h1>
      <div style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/admin/solutions">
          <Button>题解审核</Button>
        </Link>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建账号
        </Button>
        <Button icon={<UsergroupAddOutlined />} onClick={() => { setBatchResult(null); setBatchOpen(true) }}>
          批量建号
        </Button>
        <span style={{ flex: 1 }} />
        <Input.Search
          placeholder="按用户名 / 真实姓名 / 邮箱搜索"
          allowClear
          style={{ width: 280 }}
          onSearch={(v) => { setPage(1); setSearch(v.trim()) }}
        />
      </div>
      <div className="card">
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={data.results}
          pagination={{ current: page, total: data.count, pageSize: 20, showSizeChanger: false, onChange: setPage }}
          scroll={{ x: 820 }}
        />
        <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginTop: 8 }}>
          权限开关即时生效；管理员默认拥有全部权限。用户名支持中文；竞赛与班级中按「真实姓名」展示排名。
        </div>
      </div>

      {/* 新建账号 */}
      <Modal title="新建账号" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={doCreate} okText="创建">
        <Form form={createForm} layout="vertical" initialValues={{ role: 'user' }}>
          <Form.Item name="username" label="用户名（支持中文，用于登录）" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item name="real_name" label="真实姓名（排名展示用）">
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入密码' }, { min: 4, message: '至少 4 位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="email" label="邮箱（可选）" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input allowClear />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量建号 */}
      <Modal
        title="批量建号"
        open={batchOpen}
        onCancel={() => setBatchOpen(false)}
        onOk={doBatch}
        okText="批量创建"
        width={620}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          每行一个账号，用逗号分隔：<code>用户名,密码,真实姓名,角色</code>。
          真实姓名与角色可省略（角色默认 user）。例如：
        </Typography.Paragraph>
        <Input.TextArea
          rows={8}
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          placeholder={'2024001,pass1234,张三,user\n2024002,pass1234,李四\nteacher_wang,pass1234,王老师,teacher'}
          className="mono"
        />
        {batchResult && (
          <Alert
            style={{ marginTop: 12 }}
            type={batchResult.errors?.length ? 'warning' : 'success'}
            showIcon
            message={`成功创建 ${batchResult.created_count} 个${batchResult.errors?.length ? `，失败 ${batchResult.errors.length} 个` : ''}`}
            description={
              batchResult.errors?.length ? (
                <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12 }}>
                  {batchResult.errors.map((e) => (
                    <div key={e.row}>
                      第 {e.row} 行（{e.username || '空'}）：{Object.values(e.errors).flat().join('；')}
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
        )}
      </Modal>

      {/* 重置密码 */}
      <Modal
        title={pwFor ? `重置 ${pwFor.username} 的密码` : '重置密码'}
        open={pwFor !== null}
        onCancel={() => { setPwFor(null); pwForm.resetFields() }}
        onOk={doResetPw}
        okText="确认重置"
      >
        <Form form={pwForm} layout="vertical">
          <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 4, message: '至少 4 位' }]}>
            <Input.Password autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
