import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Popconfirm, Result, Space, Table, Tag, message } from 'antd'
import { DatabaseOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { canManageProblems } from '../../utils/perm'
import DifficultyTag from '../../components/DifficultyTag'

export default function ProblemManageListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    api
      .listProblems({ page, search: search || undefined })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => {
    if (canManageProblems(user)) fetchData()
  }, [fetchData, user])

  if (!canManageProblems(user)) {
    return (
      <div className="page-container">
        <Result status="403" title="仅教师及以上可访问出题管理" extra={<Link to="/problems"><Button>返回题库</Button></Link>} />
      </div>
    )
  }

  const onDelete = async (displayId) => {
    try {
      await api.deleteProblem(displayId)
      message.success('题目已删除')
      fetchData()
    } catch (e) {
      message.error(errMsg(e, '删除失败'))
    }
  }

  const columns = [
    { title: '题号', dataIndex: 'display_id', width: 110, className: 'mono' },
    {
      title: '标题',
      dataIndex: 'title',
      render: (v, r) => (
        <Link to={`/manage/problems/${r.display_id}/edit`} style={{ fontWeight: 500 }}>
          {v}
        </Link>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 200,
      render: (tags) => (tags || []).slice(0, 3).map((t) => <Tag key={t.id} bordered={false}>{t.name}</Tag>),
    },
    { title: '难度', dataIndex: 'difficulty', width: 90, render: (v) => <DifficultyTag value={v} /> },
    { title: '提交', dataIndex: 'total_submit', width: 80, className: 'mono' },
    { title: '通过率', dataIndex: 'accept_rate', width: 90, className: 'mono', render: (v) => `${v}%` },
    {
      title: '操作',
      width: 240,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/manage/problems/${r.display_id}/edit`)}>
            编辑
          </Button>
          <Button
            size="small"
            icon={<DatabaseOutlined />}
            onClick={() => navigate(`/manage/problems/${r.display_id}/edit?tab=testcases`)}
          >
            测试数据
          </Button>
          <Popconfirm title="确认删除该题目？" okText="删除" okButtonProps={{ danger: true }} onConfirm={() => onDelete(r.display_id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 className="page-title">出题管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/manage/problems/new')}>
          新建题目
        </Button>
      </div>
      <div className="card">
        <Space style={{ marginBottom: 14 }}>
          <Input.Search
            placeholder="按题号 / 标题搜索"
            allowClear
            style={{ width: 260 }}
            onSearch={(v) => {
              setPage(1)
              setSearch(v.trim())
            }}
          />
        </Space>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={data.results}
          pagination={{
            current: page,
            total: data.count,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
        <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginTop: 8 }}>
          教师可见全部题目（含隐藏草稿）；可见性在编辑页设置。
        </div>
      </div>
    </div>
  )
}
