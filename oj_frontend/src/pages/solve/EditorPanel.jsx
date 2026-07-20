import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Button, Input, message, Popconfirm, Select, Space, Tag } from 'antd'
import { CaretRightOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { LANGUAGES, TEMPLATES, monacoLangOf } from '../../utils/templates'
import { isFinal } from '../../utils/verdict'
import ResultPanel from './ResultPanel'

const draftKey = (displayId, lang) => `oj:draft:${displayId}:${lang}`

// 在线运行结果状态 -> 文案/颜色
const RUN_STATUS = {
  ok: { label: '运行完成', color: 'green' },
  tle: { label: '超时', color: 'red' },
  mle: { label: '内存超限', color: 'red' },
  ole: { label: '输出超限', color: 'orange' },
  re: { label: '运行错误', color: 'red' },
  ce: { label: '编译错误', color: 'red' },
  error: { label: '无法运行', color: 'default' },
}

export default function EditorPanel({ problem, onJudged, contestId, contestRunning }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const allowed = LANGUAGES.filter((l) => (problem.allowed_languages || []).includes(l.value))
  const defaultLang =
    user?.default_language && allowed.some((l) => l.value === user.default_language)
      ? user.default_language
      : (allowed[0] || {}).value || 'python3'

  const [language, setLanguage] = useState(defaultLang)
  const [code, setCode] = useState(
    () => localStorage.getItem(draftKey(problem.display_id, defaultLang)) || TEMPLATES[defaultLang] || ''
  )
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const cancelled = useRef(false)

  // 在线运行（自定义输入，不计入提交）。默认填入第一个样例输入，用户可改。
  const [runOpen, setRunOpen] = useState(false)
  const [stdin, setStdin] = useState(() => problem.samples?.[0]?.input ?? '')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  const switchLanguage = (lang) => {
    setLanguage(lang)
    const saved = localStorage.getItem(draftKey(problem.display_id, lang))
    setCode(saved || TEMPLATES[lang] || '')
  }

  const onCodeChange = (value) => {
    setCode(value || '')
    localStorage.setItem(draftKey(problem.display_id, language), value || '')
  }

  const resetCode = () => {
    setCode(TEMPLATES[language] || '')
    localStorage.removeItem(draftKey(problem.display_id, language))
  }

  const poll = async (id) => {
    for (let i = 0; i < 80; i += 1) {
      await new Promise((r) => setTimeout(r, 1500))
      if (cancelled.current) return
      try {
        const data = await api.getSubmission(id)
        if (cancelled.current) return
        setResult(data)
        if (isFinal(data.status)) {
          onJudged?.(data)
          return
        }
      } catch (e) {
        /* 网络抖动，继续轮询 */
      }
    }
    message.warning('评测耗时较长，请稍后在「提交记录」中查看结果')
  }

  const runOnce = async () => {
    if (!user) {
      message.warning('请先登录后再运行')
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    if (!code.trim()) {
      message.warning('代码不能为空')
      return
    }
    setRunOpen(true)
    setRunning(true)
    setRunResult(null)
    try {
      const data = await api.runCode({ language, code, stdin })
      setRunResult(data)
    } catch (e) {
      message.error(errMsg(e, '运行失败'))
    } finally {
      setRunning(false)
    }
  }

  const submit = async () => {
    if (!user) {
      message.warning('请先登录后再提交')
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    if (!code.trim()) {
      message.warning('代码不能为空')
      return
    }
    setSubmitting(true)
    try {
      const payload = { problem: problem.display_id, language, code }
      // 仅当竞赛进行中才作为赛内提交计入排行榜；否则作为普通练习记录
      if (contestId && contestRunning) payload.contest = Number(contestId)
      const data = await api.createSubmission(payload)
      setResult(data)
      poll(data.id)
    } catch (e) {
      message.error(errMsg(e, '提交失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="editor-toolbar">
        <Select
          size="small"
          style={{ width: 130 }}
          value={language}
          onChange={switchLanguage}
          options={allowed.map((l) => ({ value: l.value, label: l.label }))}
        />
        {contestId && (
          <Tag bordered={false} color={contestRunning ? 'green' : 'default'} style={{ marginLeft: 4 }}>
            {contestRunning ? '赛内提交 · 计入排行榜' : '竞赛非进行中 · 记为练习'}
          </Tag>
        )}
        <span style={{ flex: 1 }} />
        <Space>
          <Popconfirm title="恢复为默认模板？当前代码将丢失" onConfirm={resetCode}>
            <Button size="small" icon={<UndoOutlined />}>
              重置
            </Button>
          </Popconfirm>
          <Button
            size="small"
            icon={<CaretRightOutlined />}
            loading={running}
            onClick={runOnce}
          >
            运行
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<SendOutlined />}
            loading={submitting}
            onClick={submit}
          >
            提交
          </Button>
        </Space>
      </div>
      <div className="editor-wrap">
        <Editor
          height="100%"
          language={monacoLangOf(language)}
          value={code}
          onChange={onCodeChange}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', Consolas, monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
          }}
        />
      </div>
      {runOpen && (
        <div className="run-panel">
          <div className="run-io">
            <div className="run-col">
              <div className="run-label">自定义输入（stdin）<span style={{ color: 'var(--ink-soft)', fontWeight: 400, fontSize: 12 }}>· 默认样例 1，可修改</span></div>
              <Input.TextArea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                rows={4}
                className="mono"
                placeholder="在此粘贴运行时的标准输入，可留空"
              />
            </div>
            <div className="run-col">
              <div className="run-label">
                <span>输出</span>
                {runResult && RUN_STATUS[runResult.status] && (
                  <Tag bordered={false} color={RUN_STATUS[runResult.status].color}>
                    {RUN_STATUS[runResult.status].label}
                  </Tag>
                )}
                {runResult && runResult.status !== 'ce' && runResult.status !== 'error' && (
                  <span className="run-meta mono">
                    {runResult.time_ms} ms · {(runResult.memory_kb / 1024).toFixed(1)} MB
                  </span>
                )}
              </div>
              <pre className="run-output mono">
                {running
                  ? '运行中…'
                  : runResult
                    ? runResult.status === 'ce' || runResult.status === 'error'
                      ? runResult.compile_error || '无法运行'
                      : (runResult.stdout || '') +
                        (runResult.stderr ? `\n──── stderr ────\n${runResult.stderr}` : '') || '（无输出）'
                    : '点击「运行」查看输出'}
              </pre>
            </div>
          </div>
          <div className="run-actions">
            <span style={{ color: 'var(--ink-soft)', fontSize: 12, flex: 1 }}>
              在线运行仅用于自测，不计入提交记录。
            </span>
            <Button size="small" onClick={() => setRunOpen(false)}>
              收起
            </Button>
            <Button size="small" type="primary" loading={running} onClick={runOnce}>
              运行
            </Button>
          </div>
        </div>
      )}
      {result && (
        <div className="result-wrap">
          <ResultPanel submission={result} />
        </div>
      )}
    </>
  )
}
