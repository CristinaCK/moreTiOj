import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Result,
  Select,
  Spin,
  Switch,
  message,
} from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'

export default function ContestEditPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [myClasses, setMyClasses] = useState([])
  const visibility = Form.useWatch('visibility', form)

  useEffect(() => {
    api
      .listClasses()
      .then((d) => setMyClasses((d.results || d || []).filter((c) => c.my_role === 'teacher')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isEdit) return
    api
      .getContest(id)
      .then((c) => {
        form.setFieldsValue({
          title: c.title,
          description: c.description,
          rule_type: c.rule_type,
          visibility: c.visibility,
          password: c.password,
          classroom: c.classroom,
          penalty_minutes: c.penalty_minutes,
          freeze_minutes: c.freeze_minutes,
          hide_results_during_contest: c.hide_results_during_contest,
          start_time: dayjs(c.start_time),
          end_time: dayjs(c.end_time),
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, isEdit, form])

  if (!user?.is_teacher) {
    return (
      <div className="page-container">
        <Result status="403" title="仅教师可创建竞赛" extra={<Link to="/contests"><Button>返回</Button></Link>} />
      </div>
    )
  }

  const onSubmit = async () => {
    const v = await form.validateFields()
    const payload = {
      title: v.title,
      description: v.description || '',
      rule_type: v.rule_type,
      visibility: v.visibility,
      password: v.visibility === 'password' ? v.password || '' : '',
      classroom: v.visibility === 'class' ? v.classroom : null,
      penalty_minutes: v.penalty_minutes,
      freeze_minutes: v.freeze_minutes,
      hide_results_during_contest: !!v.hide_results_during_contest,
      start_time: v.start_time.toISOString(),
      end_time: v.end_time.toISOString(),
    }
    setSaving(true)
    try {
      const res = isEdit ? await api.updateContest(id, payload) : await api.createContest(payload)
      message.success(isEdit ? '已保存' : '竞赛已创建')
      navigate(`/contests/${res.id || id}`)
    } catch (e) {
      message.error(errMsg(e, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="page-container" style={{ maxWidth: 880 }}>
      <h1 className="page-title">{isEdit ? '编辑竞赛' : '创建竞赛'}</h1>
      <Card className="card" bordered={false}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            rule_type: 'acm',
            visibility: 'public',
            penalty_minutes: 20,
            freeze_minutes: 0,
            hide_results_during_contest: false,
          }}
        >
          <Form.Item name="title" label="竞赛名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={255} placeholder="如：2026 春季校赛" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="start_time" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="选择开始时间" />
            </Form.Item>
            <Form.Item
              name="end_time"
              label="结束时间"
              dependencies={['start_time']}
              rules={[
                { required: true, message: '请选择结束时间' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const start = getFieldValue('start_time')
                    if (!value || !start || value.isAfter(start)) return Promise.resolve()
                    return Promise.reject(new Error('结束时间必须晚于开始时间'))
                  },
                }),
              ]}
            >
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="选择结束时间" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="rule_type" label="赛制" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'acm', label: 'ACM/ICPC（按通过数 + 罚时）' },
                  { value: 'oi', label: 'OI（按总分）' },
                ]}
              />
            </Form.Item>
            <Form.Item name="visibility" label="可见性" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'public', label: '公开（任何人可报名）' },
                  { value: 'password', label: '密码报名' },
                  { value: 'class', label: '指定班级' },
                  { value: 'private', label: '私有（定向邀请）' },
                ]}
              />
            </Form.Item>
          </div>

          {visibility === 'password' && (
            <Form.Item name="password" label="报名密码" rules={[{ required: true, message: '请设置报名密码' }]}>
              <Input.Password maxLength={128} />
            </Form.Item>
          )}
          {visibility === 'class' && (
            <Form.Item name="classroom" label="指定班级" rules={[{ required: true, message: '请选择班级' }]}>
              <Select
                placeholder={myClasses.length ? '选择你创建的班级' : '你还没有创建班级'}
                options={myClasses.map((c) => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              name="penalty_minutes"
              label="单次错误罚时（分钟，ACM）"
              tooltip="OI 赛制下此项无效"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="freeze_minutes" label="结束前封榜（分钟，0 表示不封榜）">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            name="hide_results_during_contest"
            label="赛中隐藏成绩与榜单"
            valuePropName="checked"
            tooltip="开启后：竞赛进行中，普通选手提交只显示“已提交”，看不到评测结果与成绩，排行榜也仅创建者/管理员可见；竞赛结束后自动公开。适合考试 / 正式赛。默认关闭（实时反馈，适合练习赛）。"
          >
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>

          <Form.Item name="description" label="竞赛说明（支持 Markdown）">
            <Input.TextArea rows={6} placeholder="规则、提示、计分说明等" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 12 }}>
            <Button type="primary" loading={saving} onClick={onSubmit}>
              {isEdit ? '保存修改' : '创建竞赛'}
            </Button>
            <Button onClick={() => navigate(isEdit ? `/contests/${id}` : '/contests')}>取消</Button>
          </div>
        </Form>
        {!isEdit && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 16 }}>
            创建后在竞赛详情的「管理」选项卡中添加赛题与参赛名单。
          </p>
        )}
      </Card>
    </div>
  )
}
