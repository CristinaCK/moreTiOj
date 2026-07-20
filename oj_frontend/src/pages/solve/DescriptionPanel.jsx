import { Button, Space, Tag, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import DifficultyTag from '../../components/DifficultyTag'
import MarkdownView from '../../components/MarkdownView'
import { copyText } from '../../utils/clipboard'

const handleCopy = async (text) => {
  const ok = await copyText(text)
  if (ok) message.success('已复制')
  else message.error('复制失败')
}

function CopyBtn({ text }) {
  return (
    <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(text)} style={{ marginLeft: 'auto' }}>
      复制
    </Button>
  )
}

export default function DescriptionPanel({ problem }) {
  const isCloze = problem.problem_type === 'cloze'
  return (
    <div>
      <h2 className="problem-title">
        {problem.display_id}. {problem.title}
      </h2>
      <Space size={10} wrap style={{ marginBottom: 10 }}>
        {/* 程序填空（学业水平测试）题不展示难度/标签/SPJ */}
        {!isCloze && <DifficultyTag value={problem.difficulty} />}
        {!isCloze &&
          (problem.tags || []).map((t) => (
            <Tag key={t.id} bordered={false}>
              {t.name}
            </Tag>
          ))}
        {!isCloze && problem.spj_enabled && <Tag color="purple">Special Judge</Tag>}
        {isCloze && <Tag color="gold">程序填空题</Tag>}
      </Space>
      {!isCloze && (
        <div className="limit-meta">
          <span>时间限制：{problem.time_limit} ms</span>
          <span>内存限制：{problem.memory_limit} MB</span>
          <span className="mono">通过率 {problem.accept_rate}%</span>
        </div>
      )}

      <div className="section-label">题目描述</div>
      <MarkdownView>{problem.description}</MarkdownView>

      {!isCloze && problem.input_description && (
        <>
          <div className="section-label">输入格式</div>
          <MarkdownView>{problem.input_description}</MarkdownView>
        </>
      )}
      {!isCloze && problem.output_description && (
        <>
          <div className="section-label">输出格式</div>
          <MarkdownView>{problem.output_description}</MarkdownView>
        </>
      )}

      {!isCloze &&
        (problem.samples || []).map((s, i) => (
          <div key={i} className="sample-block" style={{ marginBottom: 14 }}>
            <div className="section-label">样例 {i + 1}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
                  输入 <CopyBtn text={s.input} />
                </div>
                <pre>{s.input}</pre>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
                  输出 <CopyBtn text={s.output} />
                </div>
                <pre>{s.output}</pre>
              </div>
            </div>
            {s.note && (
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>说明:{s.note}</div>
            )}
          </div>
        ))}

      {problem.hint && (
        <>
          <div className="section-label">提示</div>
          <MarkdownView>{problem.hint}</MarkdownView>
        </>
      )}
    </div>
  )
}
