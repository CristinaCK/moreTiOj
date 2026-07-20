import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Result,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
  message,
} from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { canManageProblems } from '../../utils/perm'
import { LANGUAGES } from '../../utils/templates'
import { DIFFICULTY_OPTIONS } from '../../utils/difficulty'
import TestcasePanel from './TestcasePanel'

export default function ProblemEditPage() {
  const { displayId } = useParams()
  const isEdit = Boolean(displayId)
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form] = Form.useForm()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState(params.get('tab') === 'testcases' && isEdit ? 'testcases' : 'info')

  const spjEnabled = Form.useWatch('spj_enabled', form)
  const compareMode = Form.useWatch('compare_mode', form)
  // 用确定的状态驱动「填空单页 / 标准 Tabs」布局，避免 useWatch 初始 undefined 造成误判
  const [ptype, setPtype] = useState('standard')
  const clozeUseJudge = Form.useWatch('cloze_use_judge', form)
  const clozeTemplate = Form.useWatch('cloze_template', form)
  // 填空题各空参考答案（文本比对模式用）。{ "1": "float|float()" }
  const [clozeAnswers, setClozeAnswers] = useState({})
  const clozeBlanks = useMemo(() => {
    const ids = new Set()
    for (const m of (clozeTemplate || '').matchAll(/__(\d+)__/g)) ids.add(Number(m[1]))
    return [...ids].sort((a, b) => a - b)
  }, [clozeTemplate])

  useEffect(() => {
    if (!isEdit) return
    api
      .getProblem(displayId)
      .then((p) => {
        form.setFieldsValue({
          display_id: p.display_id,
          title: p.title,
          difficulty: p.difficulty,
          visibility: p.visibility,
          allowed_languages: p.allowed_languages,
          time_limit: p.time_limit,
          memory_limit: p.memory_limit,
          compare_mode: p.compare_mode,
          float_precision: p.float_precision,
          tags: (p.tags || []).map((t) => t.name),
          description: p.description,
          input_description: p.input_description,
          output_description: p.output_description,
          samples: (p.samples || []).length ? p.samples : [{ input: '', output: '', note: '' }],
          hint: p.hint,
          source: p.source,
          spj_enabled: p.spj_enabled,
          spj_language: 'cpp',
          spj_code: '',
          problem_type: p.problem_type || 'standard',
          cloze_template: p.cloze_template || '',
          cloze_language: p.cloze_language || 'python3',
          cloze_use_judge: !!p.cloze_use_judge,
        })
        setPtype(p.problem_type || 'standard')
        const ans = p.cloze_answers_view || {}
        const joined = {}
        Object.keys(ans).forEach((k) => {
          joined[k] = Array.isArray(ans[k]) ? ans[k].join(' | ') : String(ans[k] ?? '')
        })
        setClozeAnswers(joined)
      })
      .catch(() => message.error('题目加载失败'))
      .finally(() => setLoading(false))
  }, [displayId, isEdit, form])

  if (!canManageProblems(user)) {
    return (
      <div className="page-container">
        <Result status="403" title="仅教师及以上可出题" extra={<Link to="/problems"><Button>返回题库</Button></Link>} />
      </div>
    )
  }

  const onSave = async () => {
    let v
    try {
      v = await form.validateFields()
    } catch (e) {
      setTab('info')
      return
    }
    const payload = {
      title: v.title,
      difficulty: v.difficulty,
      visibility: v.visibility,
      allowed_languages: v.allowed_languages,
      time_limit: v.time_limit,
      memory_limit: v.memory_limit,
      compare_mode: v.compare_mode,
      float_precision: v.float_precision ?? 1e-6,
      tags: v.tags || [],
      description: v.description || '',
      input_description: v.input_description || '',
      output_description: v.output_description || '',
      samples: (v.samples || [])
        .filter((s) => s && (s.input?.trim() || s.output?.trim()))
        .map((s) => ({ input: s.input || '', output: s.output || '', note: s.note || '' })),
      hint: v.hint || '',
      source: v.source || '',
      spj_enabled: !!v.spj_enabled,
    }
    if (v.spj_enabled) {
      payload.spj_language = v.spj_language || 'cpp'
      // 编辑时若 SPJ 代码留空则不提交该字段，后端保留原代码
      if (v.spj_code?.trim()) payload.spj_code = v.spj_code
    } else {
      payload.spj_code = ''
    }
    // 题号由后端自动分配，前端不再提交

    // 程序填空题
    payload.problem_type = v.problem_type || 'standard'
    if (payload.problem_type === 'cloze') {
      if (!(v.cloze_template || '').trim() || clozeBlanks.length === 0) {
        message.error('填空题需填写模板，并至少包含一个 __1__ 形式的空')
        return
      }
      payload.cloze_template = v.cloze_template
      payload.cloze_language = v.cloze_language || 'python3'
      payload.cloze_use_judge = !!v.cloze_use_judge
      if (v.cloze_use_judge) {
        payload.cloze_answers = {}
      } else {
        const ans = {}
        let missing = false
        clozeBlanks.forEach((b) => {
          const raw = (clozeAnswers[b] || '').trim()
          if (!raw) missing = true
          ans[b] = raw.split('|').map((x) => x.trim()).filter(Boolean)
        })
        if (missing) {
          message.error('文本比对模式下，请为每个空填写参考答案')
          return
        }
        payload.cloze_answers = ans
      }
    } else {
      payload.cloze_template = ''
      payload.cloze_answers = {}
    }

    setSaving(true)
    try {
      if (isEdit) {
        await api.updateProblem(displayId, payload)
        message.success('已保存')
      } else {
        const created = await api.createProblem(payload)
        message.success('题目已创建')
        navigate(
          `/manage/problems/${created.display_id}/edit${payload.problem_type === 'cloze' ? '' : '?tab=testcases'}`
        )
      }
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

  const infoForm = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        difficulty: 'entry',
        visibility: 'hidden',
        allowed_languages: ['python3', 'cpp'],
        time_limit: 1000,
        memory_limit: 256,
        compare_mode: 'default',
        float_precision: 1e-6,
        spj_enabled: false,
        spj_language: 'cpp',
        problem_type: 'standard',
        cloze_language: 'python3',
        cloze_use_judge: false,
        samples: [{ input: '', output: '', note: '' }],
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: ptype === 'cloze' ? '200px 1fr' : '160px 1fr 140px', gap: 16 }}>
        <Form.Item
          name="display_id"
          label="题号"
          tooltip="题号由系统自动分配（从 00001 起递增），创建后不可修改"
        >
          <Input disabled placeholder={isEdit ? '' : '保存后由系统自动分配'} />
        </Form.Item>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input maxLength={255} />
        </Form.Item>
        {ptype !== 'cloze' && (
          <Form.Item name="difficulty" label="难度" rules={[{ required: true }]}>
            <Select options={DIFFICULTY_OPTIONS} />
          </Form.Item>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
        <Form.Item name="problem_type" label="题型" rules={[{ required: true }]}>
          <Select
            onChange={(v) => setPtype(v)}
            options={[
              { value: 'standard', label: '算法题（提交代码）' },
              { value: 'cloze', label: '学业水平测试题（程序填空）' },
            ]}
          />
        </Form.Item>
        <Form.Item name="visibility" label="可见性" rules={[{ required: true }]} tooltip="隐藏=草稿；公开后学生可见；班级作业题可保持隐藏，学生从作业进入即可">
          <Select
            options={[
              { value: 'hidden', label: '隐藏（草稿）' },
              { value: 'public', label: '公开' },
              { value: 'contest', label: '仅竞赛可见' },
              { value: 'class', label: '仅指定班级可见' },
            ]}
          />
        </Form.Item>
      </div>

      {ptype === 'cloze' && (
        <Card size="small" title="程序填空设置" style={{ marginBottom: 16, background: '#fcfbf7' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16 }}>
            <Form.Item name="cloze_language" label="模板语言" rules={[{ required: true }]}>
              <Select options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
            </Form.Item>
            <Form.Item
              name="cloze_use_judge"
              label="判定方式"
              valuePropName="checked"
              tooltip="文本比对：按参考答案逐空比对（忽略空白差异）；评测机运行：用学生填空组装成完整程序后按测试点运行"
            >
              <Switch checkedChildren="评测机运行" unCheckedChildren="文本比对" />
            </Form.Item>
          </div>
          <Form.Item
            name="cloze_template"
            label="填空模板"
            tooltip="用 __1__ __2__ 形式挖空，编号从 1 开始"
            rules={[{ required: true, message: '请填写模板' }]}
          >
            <Input.TextArea
              rows={8}
              className="mono"
              placeholder={'height = __1__(input())\nweight = __2__(input())\nbmi = __3__\nprint(bmi)'}
            />
          </Form.Item>
          <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 8 }}>
            已检测到 {clozeBlanks.length} 个空：
            <span className="mono">{clozeBlanks.map((b) => `__${b}__`).join('  ') || '（无）'}</span>
          </div>
          {!clozeUseJudge && clozeBlanks.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>各空参考答案</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 8 }}>
                每空可填多个可接受写法，用 <code>|</code> 分隔；比对忽略空白（如 a+b 与 a + b 视为相同）。
              </div>
              {clozeBlanks.map((b) => (
                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="mono" style={{ width: 56 }}>__{b}__</span>
                  <Input
                    className="mono"
                    value={clozeAnswers[b] || ''}
                    onChange={(e) => setClozeAnswers((m) => ({ ...m, [b]: e.target.value }))}
                    placeholder="如：float   或   weight/height**2 | weight / height ** 2"
                  />
                </div>
              ))}
            </div>
          )}
          {isEdit ? (
            <>
              <div className="section-label">
                测试数据{clozeUseJudge ? '（评测机模式按此评测）' : '（评测机模式下生效；文本比对模式可不传）'}
              </div>
              <TestcasePanel displayId={displayId} />
            </>
          ) : (
            <Alert type="info" showIcon message="保存题目后，可在本页上传测试数据。" />
          )}
        </Card>
      )}

      {ptype !== 'cloze' && (
        <>
          <Form.Item name="allowed_languages" label="允许语言" rules={[{ required: true, message: '至少选择一种语言' }]}>
            <Checkbox.Group options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
            <Form.Item name="time_limit" label="时间限制 (ms)" rules={[{ required: true }]}>
              <InputNumber min={100} max={20000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="memory_limit" label="内存限制 (MB)" rules={[{ required: true }]}>
              <InputNumber min={16} max={1024} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="compare_mode" label="比对模式" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'default', label: '默认（忽略行末空格）' },
                  { value: 'strict', label: '严格逐字节' },
                  { value: 'float', label: '浮点误差' },
                ]}
              />
            </Form.Item>
            {compareMode === 'float' ? (
              <Form.Item name="float_precision" label="浮点精度">
                <InputNumber min={0} step={1e-6} style={{ width: '100%' }} />
              </Form.Item>
            ) : (
              <div />
            )}
          </div>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" tokenSeparators={[',', ' ']} placeholder="输入后回车，自动创建标签" open={false} />
          </Form.Item>
        </>
      )}

      <Form.Item name="description" label="题目描述（Markdown + LaTeX）" rules={[{ required: true, message: '请输入题目描述' }]}>
        <Input.TextArea rows={8} placeholder="支持 Markdown 与 $公式$" />
      </Form.Item>
      {ptype !== 'cloze' && (
        <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Form.Item name="input_description" label="输入格式">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="output_description" label="输出格式">
          <Input.TextArea rows={4} />
        </Form.Item>
      </div>

      <div className="section-label" style={{ marginTop: 0 }}>
        样例
      </div>
      <Form.List name="samples">
        {(fields, { add, remove }) => (
          <div>
            {fields.map((field) => (
              <div key={field.key} className="sample-edit-row">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Form.Item name={[field.name, 'input']} label="输入" style={{ marginBottom: 8 }}>
                    <Input.TextArea rows={3} className="mono" />
                  </Form.Item>
                  <Form.Item name={[field.name, 'output']} label="输出" style={{ marginBottom: 8 }}>
                    <Input.TextArea rows={3} className="mono" />
                  </Form.Item>
                </div>
                <Form.Item name={[field.name, 'note']} label="说明（可选）" style={{ marginBottom: 8 }}>
                  <Input />
                </Form.Item>
                <Button type="link" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>
                  删除该样例
                </Button>
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ input: '', output: '', note: '' })} block>
              添加样例
            </Button>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
              样例仅用于题面展示；真正用于评测的测试点请在「测试数据」选项卡上传。
            </Typography.Paragraph>
          </div>
        )}
      </Form.List>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        <Form.Item name="hint" label="提示（可选）">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="source" label="来源（可选）">
          <Input placeholder="如：改编自 …" />
        </Form.Item>
      </div>

      <div className="section-label">Special Judge</div>
      <Form.Item name="spj_enabled" valuePropName="checked">
        <Switch checkedChildren="启用 SPJ" unCheckedChildren="不启用" />
      </Form.Item>
      {spjEnabled && (
        <>
          {isEdit && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="出于安全，编辑时不回显已有 SPJ 代码；留空保存则保留原代码，填写则覆盖。"
            />
          )}
          <Form.Item name="spj_language" label="SPJ 语言">
            <Select style={{ width: 160 }} options={[{ value: 'cpp', label: 'C++' }]} />
          </Form.Item>
          <Form.Item
            name="spj_code"
            label="SPJ 源代码（建议遵循 testlib.h 接口）"
            rules={isEdit ? [] : [{ required: true, message: '启用 SPJ 时必须提供源代码' }]}
          >
            <Input.TextArea rows={10} className="mono" placeholder="#include &quot;testlib.h&quot; ..." />
          </Form.Item>
        </>
      )}
        </>
      )}
    </Form>
  )

  return (
    <div className="page-container" style={{ maxWidth: 960 }}>
      <Link to="/manage/problems" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        ← 返回出题管理
      </Link>
      <h1 className="page-title">{isEdit ? `编辑题目 · ${displayId}` : '新建题目'}</h1>

      <Card className="card" bordered={false}>
        {ptype === 'cloze' ? (
          <>
            {infoForm}
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" loading={saving} onClick={onSave}>
                {isEdit ? '保存修改' : '创建题目'}
              </Button>
              <Button onClick={() => navigate('/manage/problems')}>返回</Button>
            </Space>
          </>
        ) : (
          <>
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                { key: 'info', label: '题目信息', children: infoForm },
                {
                  key: 'testcases',
                  label: '测试数据',
                  disabled: !isEdit,
                  children: isEdit ? (
                    <TestcasePanel displayId={displayId} />
                  ) : (
                    <Typography.Text type="secondary">请先保存题目，再上传测试数据。</Typography.Text>
                  ),
                },
              ]}
            />
            {tab === 'info' && (
              <Space style={{ marginTop: 12 }}>
                <Button type="primary" loading={saving} onClick={onSave}>
                  {isEdit ? '保存修改' : '创建题目'}
                </Button>
                <Button onClick={() => navigate('/manage/problems')}>返回</Button>
              </Space>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
