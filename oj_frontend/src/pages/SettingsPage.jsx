import { useEffect, useState } from 'react'
import { Alert, Button, Card, Divider, Form, Input, Select, Switch, Typography, message } from 'antd'
import { Navigate } from 'react-router-dom'
import * as api from '../api'
import { errMsg } from '../api'
import { useAuth } from '../auth/AuthContext'
import { LANGUAGES } from '../utils/templates'

export default function SettingsPage() {
  const { user, setUser } = useAuth()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        avatar: user.avatar,
        bio: user.bio,
        default_language: user.default_language,
        publicize_contest_code: user.publicize_contest_code,
      })
    }
  }, [user, form])

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const onSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const updated = await api.updateMe(values)
      setUser(updated)
      message.success('已保存')
    } catch (e) {
      message.error(errMsg(e, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <h1 className="page-title">个人设置</h1>

      <Card className="card" bordered={false} title="资料与偏好">
        <Form form={form} layout="vertical">
          <Form.Item label="用户名">
            <Input value={user.username} disabled />
          </Form.Item>
          <Form.Item label="邮箱">
            <Input value={user.email} disabled />
          </Form.Item>
          <Form.Item name="avatar" label="头像链接（URL）">
            <Input placeholder="https://..." allowClear />
          </Form.Item>
          <Form.Item name="bio" label="个人简介">
            <Input.TextArea rows={3} maxLength={255} showCount placeholder="一句话介绍自己" />
          </Form.Item>
          <Form.Item name="default_language" label="默认编程语言">
            <Select options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} style={{ width: 200 }} />
          </Form.Item>

          <Divider />

          <Form.Item
            name="publicize_contest_code"
            label="竞赛结束后公开我的代码"
            valuePropName="checked"
            tooltip="开启后，你在已结束竞赛中的提交代码将对其他人可见；比赛进行中始终保密，本人任何时候都能看自己的代码。"
          >
            <Switch checkedChildren="公开" unCheckedChildren="保密" />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -8 }}>
            该设置只影响「已结束竞赛」中的提交是否对他人可见，普通练习提交始终仅本人可见。
          </Typography.Paragraph>

          <Button type="primary" loading={saving} onClick={onSave}>
            保存设置
          </Button>
        </Form>
      </Card>

      <Card className="card" bordered={false} title="账号安全" style={{ marginTop: 18 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          为统一管理，本平台不开放自助修改密码。如需重置密码，请联系管理员在后台为你重置。
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
