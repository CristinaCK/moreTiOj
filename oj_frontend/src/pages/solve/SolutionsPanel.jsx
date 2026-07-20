import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, List, message, Modal, Select, Spin, Tag } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import MarkdownView from '../../components/MarkdownView'
import { LANGUAGES } from '../../utils/templates'

const AUDIT = {
  pending: { label: '待审核', color: 'gold' },
  rejected: { label: '已驳回', color: 'red' },
}

export default function SolutionsPanel({ problem }) {
  const { user } = useAuth()
  const [items, setItems] = useState(null)
  const [viewing, setViewing] = useState(null) // {title, loading, content...}
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(() => {
    api
      .listSolutions({ problem: problem.display_id })
      .then((d) => setItems(d.results || []))
      .catch(() => setItems([]))
  }, [problem.display_id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openSolution = async (item) => {
    setViewing({ ...item, loading: true })
    try {
      const detail = await api.getSolution(item.id)
      setViewing({ ...detail, loading: false })
    } catch (e) {
      message.error(errMsg(e, '加载失败'))
      setViewing(null)
    }
  }

  const onCreate = async () => {
    const values = await form.validateFields()
    try {
      await api.createSolution({ ...values, problem: problem.display_id })
      message.success('已提交，等待管理员审核')
      setCreateOpen(false)
      form.resetFields()
      fetchData()
    } catch (e) {
      message.error(errMsg(e, '发布失败'))
    }
  }

  if (items === null) return <Spin />

  return (
    <div>
      {user && (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EditOutlined />}
          style={{ marginBottom: 12 }}
          onClick={() => setCreateOpen(true)}
        >
          写题解（需先通过本题）
        </Button>
      )}
      {items.length === 0 ? (
        <Empty description="暂无题解" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={items}
          renderItem={(item) => (
            <List.Item
              className="clickable-row"
              onClick={() => openSolution(item)}
              actions={[
                <span key="t" className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {dayjs(item.created_at).format('YYYY-MM-DD')}
                </span>,
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {item.title}
                    {item.language && (
                      <Tag bordered={false} style={{ marginLeft: 8 }}>
                        {item.language}
                      </Tag>
                    )}
                    {AUDIT[item.audit_status] && (
                      <Tag color={AUDIT[item.audit_status].color} style={{ marginLeft: 4 }}>
                        {AUDIT[item.audit_status].label}
                      </Tag>
                    )}
                  </span>
                }
                description={`作者：${item.author_name}`}
              />
            </List.Item>
          )}
        />
      )}

      <Drawer
        title={viewing?.title}
        width={640}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      >
        {viewing?.loading ? (
          <Spin />
        ) : (
          <>
            {viewing?.reject_reason && (
              <Tag color="red" style={{ marginBottom: 12 }}>
                驳回理由:{viewing.reject_reason}
              </Tag>
            )}
            <MarkdownView>{viewing?.content}</MarkdownView>
          </>
        )}
      </Drawer>

      <Modal
        title={`写题解 · ${problem.display_id}. ${problem.title}`}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={onCreate}
        okText="提交审核"
        width={680}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="language" label="使用语言（可选）">
            <Select allowClear options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
          </Form.Item>
          <Form.Item
            name="content"
            label="正文（支持 Markdown 与 LaTeX 公式）"
            rules={[{ required: true, message: '请输入正文' }]}
          >
            <Input.TextArea rows={10} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
