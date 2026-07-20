import { Alert, Space, Spin, Table, Tag, Typography } from 'antd'
import VerdictTag from '../../components/VerdictTag'
import { isFinal, verdictOf } from '../../utils/verdict'

export default function ResultPanel({ submission }) {
  // 竞赛进行中：普通选手只看到“已提交成功”，评测结果与成绩赛后公布
  if (submission.sealed) {
    return (
      <Alert
        type="info"
        showIcon
        message="已提交成功"
        description="本场竞赛进行中，判题结果与成绩将在竞赛结束后公布。你可以用「运行」自测样例输入。"
      />
    )
  }

  const judging = !isFinal(submission.status)
  const v = verdictOf(submission.status)

  return (
    <div>
      <Space size={14} align="center" style={{ marginBottom: 8 }}>
        {judging && <Spin size="small" />}
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          <VerdictTag status={submission.status} />
        </span>
        {isFinal(submission.status) && (
          <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
            用时 {submission.time_used} ms · 内存 {Math.round((submission.memory_used || 0) / 1024)} MB
            {submission.score > 0 ? ` · 得分 ${submission.score}` : ''}
          </span>
        )}
      </Space>

      {submission.first_failed_index != null && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10 }}
          message={`未通过测试点 #${submission.first_failed_index}（${v.label}）`}
        />
      )}

      {submission.status === 'ce' && submission.compile_error && (
        <pre
          className="mono"
          style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 8,
            padding: 12,
            fontSize: 12.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {submission.compile_error}
        </pre>
      )}

      {(() => {
        const results = submission.test_results || []
        const groups = {}
        results.forEach((r) => {
          if (r.group > 0) {
            if (!groups[r.group]) groups[r.group] = { cases: [], earned: 0 }
            groups[r.group].cases.push(r)
            groups[r.group].earned += r.score || 0
          }
        })
        const gids = Object.keys(groups).map(Number).sort((a, b) => a - b)
        if (gids.length === 0) return null
        return (
          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {gids.map((g) => {
              const info = groups[g]
              const passed = info.cases.every((c) => c.status === 'ac')
              return (
                <Tag key={g} color={passed ? 'green' : 'red'}>
                  子任务{g}：{passed ? '通过' : '未通过'} · {info.earned} 分
                </Tag>
              )
            })}
          </div>
        )
      })()}

      {(submission.test_results || []).length > 0 && (
        <Table
          size="small"
          rowKey="index"
          pagination={false}
          columns={[
            { title: '测试点', dataIndex: 'index', width: 72, className: 'mono' },
            {
              title: '子任务',
              dataIndex: 'group',
              width: 80,
              render: (g) => (g ? `子任务${g}` : <span style={{ color: 'var(--ink-soft)' }}>—</span>),
            },
            {
              title: '结果',
              dataIndex: 'status',
              width: 110,
              render: (s) => <VerdictTag status={s} />,
            },
            { title: '用时(ms)', dataIndex: 'time_used', width: 90, className: 'mono' },
            {
              title: '内存',
              dataIndex: 'memory_used',
              width: 90,
              className: 'mono',
              render: (kb) => `${Math.round((kb || 0) / 1024)} MB`,
            },
            { title: '得分', dataIndex: 'score', width: 70, className: 'mono' },
          ]}
          dataSource={submission.test_results}
          expandable={{
            rowExpandable: (r) => Boolean(r.input_preview || r.expected_output || r.actual_output),
            expandedRowRender: (r) => (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <SampleCell title="输入" value={r.input_preview} />
                <SampleCell title="期望输出" value={r.expected_output} />
                <SampleCell title="你的输出" value={r.actual_output} />
              </div>
            ),
          }}
        />
      )}

      {(submission.test_results || []).length > 0 && (
        <Typography.Paragraph style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
          <Tag bordered={false}>说明</Tag>
          样例测试点展示输入输出数据；隐藏测试点的数据仅管理员可见。
        </Typography.Paragraph>
      )}
    </div>
  )
}

function SampleCell({ title, value }) {
  return (
    <div className="sample-block">
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>{title}</div>
      <pre style={{ maxHeight: 160, overflow: 'auto' }}>{value || '（无）'}</pre>
    </div>
  )
}
