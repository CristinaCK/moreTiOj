import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, message, Modal, Select, Space, Table, Tag } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../api'
import { errMsg } from '../api'
import { useAuth } from '../auth/AuthContext'

export default function DiscussionListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(() => {
    setLoading(true)
    api
      .listDiscussions({ page, search: search || undefined })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const onCreate = async () => {
    const values = await form.validateFields()
    try {
      const created = await api.createDiscussion(values)
      message.success('发布成功')
      setCreateOpen(false)
      form.resetFields()
      if (created?.id) navigate(`/discussions/${created.id}`)
      else fetchData()
    } catch (e) {
      message.error(errMsg(e, '发布失败'))
    }
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      render: (v, r) => (
        <Link to={`/discussions/${r.id}`} style={{ fontWeight: 500 }}>
          {v}
          {r.problem_display_id && (
            <Tag bordered={false} style={{ marginLeft: 8 }}>
              题目 #{r.problem_display_id}
            </Tag>
          )}
        </Link>
      ),
    },
    { title: '作者', dataIndex: 'author_name', width: 130 },
    {
      title: '分类',
      dataIndex: 'category',
      width: 110,
      render: (v) => (v ? <Tag bordered={false}>{v}</Tag> : null),
    },
    { title: '回复', dataIndex: 'reply_count', width: 70, className: 'mono' },
    {
      title: '最后活跃',
      dataIndex: 'updated_at',
      width: 160,
      className: 'mono',
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 className="page-title">讨论</h1>
        {user && (
          <Button type="primary" icon={<EditOutlined />} onClick={() => setCreateOpen(true)}>
            发帖
          </Button>
        )}
      </div>
      <div className="card">
        <Space style={{ marginBottom: 14 }}>
          <Input.Search
            placeholder="按标题搜索"
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
          onRow={(record) => ({
            onClick: () => navigate(`/discussions/${record.id}`),
            className: 'clickable-row',
          })}
          pagination={{
            current: page,
            total: data.count,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </div>
      <Modal title="发布讨论" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={onCreate} okText="发布" width={640}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="category" label="分类（可选）">
            <Select
              allowClear
              placeholder="选择或留空"
              options={['求助', '题解交流', '分享', '闲聊', '反馈'].map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item name="content" label="正文（支持 Markdown）" rules={[{ required: true, message: '请输入正文' }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
