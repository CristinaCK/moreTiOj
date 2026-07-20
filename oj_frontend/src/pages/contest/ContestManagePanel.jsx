import { useState } from 'react'
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'

/**
 * 仅对教师展示。若当前用户并非该赛创建者，后端会返回 403，这里直接把
 * 后端的提示透出，不在前端二次猜测权限。
 */
export default function ContestManagePanel({ contest, onChanged }) {
  const navigate = useNavigate()
  const [problemForm] = Form.useForm()
  const [partForm] = Form.useForm()
  const [busy, setBusy] = useState(false)

  const addProblem = async () => {
    const values = await problemForm.validateFields()
    setBusy(true)
    try {
      const res = await api.addContestProblem(contest.id, values)
      message.success(res.detail || '已添加赛题')
      problemForm.resetFields()
      onChanged?.()
    } catch (e) {
      message.error(errMsg(e, '添加失败'))
    } finally {
      setBusy(false)
    }
  }

  const addParticipants = async () => {
    const { usernames } = await partForm.validateFields()
    const list = usernames
      .split(/[\s,，]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length === 0) return
    setBusy(true)
    try {
      const res = await api.addContestParticipants(contest.id, list)
      const parts = []
      if (res.added?.length) parts.push(`新增 ${res.added.length}`)
      if (res.already?.length) parts.push(`已存在 ${res.already.length}`)
      if (res.not_found?.length) parts.push(`未找到 ${res.not_found.join('、')}`)
      message.success(parts.join('；') || '已处理')
      partForm.resetFields()
      onChanged?.()
    } catch (e) {
      message.error(errMsg(e, '添加失败'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const username = partForm.getFieldValue('removeUser')
    if (!username) {
      message.warning('请输入要移除的用户名')
      return
    }
    try {
      const res = await api.removeContestParticipant(contest.id, username)
      message.success(res.detail || '已移除')
      onChanged?.()
    } catch (e) {
      message.error(errMsg(e, '移除失败'))
    }
  }

  const onDelete = async () => {
    try {
      await api.deleteContest(contest.id)
      message.success('竞赛已删除')
      navigate('/contests')
    } catch (e) {
      message.error(errMsg(e, '删除失败'))
    }
  }

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        管理操作仅竞赛创建者或管理员可执行。赛题建议设为「公开」可见性，参赛者才能在赛中打开题面作答。
      </Typography.Paragraph>

      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate(`/contests/${contest.id}/edit`)}>编辑竞赛信息</Button>
      </Space>

      <div className="section-label">添加 / 更新赛题</div>
      <Form form={problemForm} layout="inline" style={{ rowGap: 10, flexWrap: 'wrap' }}>
        <Form.Item name="display_id" rules={[{ required: true, message: '题号' }]}>
          <Input placeholder="题号 如 1001" style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="label" rules={[{ required: true, message: '序号' }]}>
          <Input placeholder="序号 如 A" style={{ width: 100 }} />
        </Form.Item>
        <Form.Item name="score" initialValue={100} rules={[{ required: true }]}>
          <InputNumber min={0} placeholder="分值" style={{ width: 110 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" ghost icon={<PlusOutlined />} loading={busy} onClick={addProblem}>
            加入赛题
          </Button>
        </Form.Item>
      </Form>
      <div style={{ marginTop: 10 }}>
        {(contest.problems || []).length === 0 ? (
          <Typography.Text type="secondary">尚未添加赛题。</Typography.Text>
        ) : (
          <Space wrap>
            {contest.problems.map((p) => (
              <Tag key={p.label} bordered={false} color="green">
                {p.label}. {p.title}（{p.score} 分）
              </Tag>
            ))}
          </Space>
        )}
      </div>

      <Divider />

      <div className="section-label">参赛名单（私有赛定向邀请）</div>
      <Form form={partForm} layout="vertical">
        <Form.Item
          name="usernames"
          label="批量添加参赛者"
          extra="多个用户名用空格、逗号或换行分隔"
        >
          <Input.TextArea rows={2} placeholder="alice bob charlie" />
        </Form.Item>
        <Space>
          <Button loading={busy} onClick={addParticipants}>
            添加参赛者
          </Button>
        </Space>
        <Form.Item name="removeUser" label="移除参赛者" style={{ marginTop: 16 }}>
          <Input placeholder="输入单个用户名" style={{ width: 240 }} />
        </Form.Item>
        <Button danger icon={<DeleteOutlined />} onClick={remove}>
          移除
        </Button>
      </Form>

      <Divider />

      <div className="section-label">危险操作</div>
      <Popconfirm title="确认删除该竞赛？相关排行榜数据将一并消失。" okText="删除" okButtonProps={{ danger: true }} onConfirm={onDelete}>
        <Button danger icon={<DeleteOutlined />}>
          删除竞赛
        </Button>
      </Popconfirm>
    </div>
  )
}
