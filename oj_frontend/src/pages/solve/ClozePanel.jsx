import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Tag, message } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import * as api from '../../api'
import { errMsg } from '../../api'
import { useAuth } from '../../auth/AuthContext'
import { isFinal } from '../../utils/verdict'
import ResultPanel from './ResultPanel'

// 把模板按 __N__ 切分，渲染成「文本 + 行内空位」交错
function renderTemplate(template, answers, onChange) {
  const parts = []
  const re = /__(\d+)__/g
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) parts.push(<span key={`t${key++}`}>{template.slice(last, m.index)}</span>)
    const id = m[1]
    parts.push(
      <input
        key={`b${id}-${key++}`}
        className="cloze-blank mono"
        value={answers[id] || ''}
        onChange={(e) => onChange(id, e.target.value)}
        placeholder={`空${id}`}
        size={Math.max(6, (answers[id] || '').length + 2)}
      />
    )
    last = re.lastIndex
  }
  if (last < template.length) parts.push(<span key={`t${key++}`}>{template.slice(last)}</span>)
  return parts
}

export default function ClozePanel({ problem, onJudged, contestId, contestRunning }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const blanks = useMemo(() => {
    const ids = new Set()
    for (const mm of (problem.cloze_template || '').matchAll(/__(\d+)__/g)) ids.add(mm[1])
    return [...ids].sort((a, b) => Number(a) - Number(b))
  }, [problem.cloze_template])

  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
    }
  }, [])

  const setAns = (id, val) => setAnswers((m) => ({ ...m, [id]: val }))

  const poll = async (id) => {
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 1200))
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
        /* 继续轮询 */
      }
    }
  }

  const submit = async () => {
    if (!user) {
      message.warning('请先登录后再提交')
      navigate('/login', { state: { from: location.pathname } })
      return
    }
    if (!blanks.some((b) => (answers[b] || '').trim())) {
      message.warning('请至少填写一个空')
      return
    }
    setSubmitting(true)
    try {
      const payload = { problem: problem.display_id, cloze_answers: answers }
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
        <Tag bordered={false} color="gold">
          程序填空题
        </Tag>
        <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
          {problem.cloze_use_judge ? '评测机判定' : '答案比对（忽略空白）'} · 共 {blanks.length} 空
        </span>
        {contestId && (
          <Tag bordered={false} color={contestRunning ? 'green' : 'default'} style={{ marginLeft: 4 }}>
            {contestRunning ? '赛内提交' : '记为练习'}
          </Tag>
        )}
        <span style={{ flex: 1 }} />
        <Button type="primary" size="small" icon={<SendOutlined />} loading={submitting} onClick={submit}>
          提交
        </Button>
      </div>

      <div className="cloze-wrap">
        <div style={{ color: 'var(--ink-soft)', fontSize: 12, marginBottom: 8 }}>
          在下方代码的空位中直接填写（也可对照下方编号输入框）：
        </div>
        <pre className="cloze-code mono">{renderTemplate(problem.cloze_template || '', answers, setAns)}</pre>

        <div className="cloze-fields">
          {blanks.map((b) => (
            <div key={b} className="cloze-field">
              <span className="mono cloze-field-label">空 {b}</span>
              <Input className="mono" value={answers[b] || ''} onChange={(e) => setAns(b, e.target.value)} placeholder={`__${b}__`} />
            </div>
          ))}
        </div>
      </div>

      {result && (
        <div className="result-wrap">
          <ResultPanel submission={result} />
        </div>
      )}
    </>
  )
}
