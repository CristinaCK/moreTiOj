import { useCallback, useEffect, useState } from 'react'
import { Button, Empty, Form, Input, Modal, Spin, Tag, message } from 'antd'
import { PlusOutlined, TeamOutlined, UsergroupAddOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'

export default function ClassListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [createForm] = Form.useForm()
  const [joinForm] = Form.useForm()

  const fetchData = useCallback(() => {
    api
      .listClasses()
      .then((d) => setList(d.results || d || []))
      .catch(() => setList([]))
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const onCreate = async () => {
    const values = await createForm.validateFields()
    try {
      const c = await api.createClass(values)
      message.success('班级已创建')
      setCreateOpen(false)
      createForm.resetFields()
      navigate(`/classes/${c.id}`)
    } catch (e) {
      message.error(errMsg(e, '创建失败'))
    }
  }

  const onJoin = async () => {
    const { invite_code } = await joinForm.validateFields()
    try {
      const res = await api.joinClass(invite_code.trim())
      message.success(res.detail || '加入成功')
      setJoinOpen(false)
      joinForm.resetFields()
      if (res.class_id) navigate(`/classes/${res.class_id}`)
      else fetchData()
    } catch (e) {
      message.error(errMsg(e, '加入失败'))
    }
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 className="page-title">班级</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button icon={<UsergroupAddOutlined />} onClick={() => setJoinOpen(true)}>
            加入班级
          </Button>
          {user?.is_teacher && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建班级
            </Button>
          )}
        </div>
      </div>

      {list === null ? (
        <Spin />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty description="还没有班级。教师可创建班级，学生可凭邀请码加入。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div className="class-grid">
          {list.map((c) => (
            <div key={c.id} className="class-card clickable-row" onClick={() => navigate(`/classes/${c.id}`)}>
              <div className="class-card-icon">
                <TeamOutlined />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="class-card-name">{c.name}</span>
                  <Tag color={c.my_role === 'teacher' ? 'green' : 'default'} bordered={false}>
                    {c.my_role === 'teacher' ? '我执教' : c.my_role === 'assistant' ? '助教' : '学生'}
                  </Tag>
                </div>
                <div className="class-card-desc">{c.description || '暂无简介'}</div>
                <div className="class-card-meta mono">
                  教师 {c.teacher_name} · {c.member_count} 名成员
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal title="创建班级" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={onCreate} okText="创建">
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="班级名称" rules={[{ required: true, message: '请输入班级名称' }]}>
            <Input maxLength={128} placeholder="如：算法基础 2026 春" />
          </Form.Item>
          <Form.Item name="description" label="简介（可选）">
            <Input.TextArea rows={2} maxLength={255} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="加入班级" open={joinOpen} onCancel={() => setJoinOpen(false)} onOk={onJoin} okText="加入">
        <Form form={joinForm} layout="vertical">
          <Form.Item
            name="invite_code"
            label="邀请码"
            rules={[{ required: true, message: '请输入邀请码' }]}
            extra="向班级教师索取邀请码"
          >
            <Input placeholder="粘贴邀请码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
