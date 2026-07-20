import { useCallback, useEffect, useState } from 'react'
import { Drawer, Empty, Spin, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import * as api from '../../api'
import { useAuth } from '../../auth/AuthContext'
import VerdictTag from '../../components/VerdictTag'
import ResultPanel from './ResultPanel'

export default function SubmissionsPanel({ problem, refreshKey }) {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState(null) // {loading, ...submission}

  const fetchData = useCallback(() => {
    if (!user) return
    api
      .listSubmissions({ problem: problem.display_id, mine: 1, page })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
  }, [user, problem.display_id, page, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (!user) {
    return <Empty description="登录后可查看你的提交记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }
  if (data === null) return <Spin />

  const openDetail = async (record) => {
    setDetail({ loading: true })
    try {
      const d = await api.getSubmission(record.id)
      setDetail({ ...d, loading: false })
    } catch (e) {
      setDetail(null)
    }
  }

  return (
    <div>
      <Table
        size="small"
        rowKey="id"
        dataSource={data.results}
        onRow={(record) => ({ onClick: () => openDetail(record), className: 'clickable-row' })}
        pagination={{
          current: page,
          total: data.count,
          pageSize: 20,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: '结果',
            dataIndex: 'status',
            width: 130,
            render: (s, r) => (
              <span>
                <VerdictTag status={s} />
                {r.first_failed_index != null && (
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    #{r.first_failed_index}
                  </span>
                )}
              </span>
            ),
          },
          { title: '语言', dataIndex: 'language', width: 90, render: (v) => <Tag bordered={false}>{v}</Tag> },
          {
            title: '用时',
            dataIndex: 'time_used',
            width: 90,
            className: 'mono',
            render: (v) => (v == null ? '—' : `${v} ms`),
          },
          {
            title: '内存',
            dataIndex: 'memory_used',
            width: 90,
            className: 'mono',
            render: (kb) => (kb == null ? '—' : `${Math.round((kb || 0) / 1024)} MB`),
          },
          {
            title: '提交时间',
            dataIndex: 'created_at',
            className: 'mono',
            render: (v) => dayjs(v).format('MM-DD HH:mm:ss'),
          },
        ]}
      />

      <Drawer title="提交详情" width={680} open={Boolean(detail)} onClose={() => setDetail(null)}>
        {detail?.loading ? (
          <Spin />
        ) : (
          detail && (
            <>
              <ResultPanel submission={detail} />
              {detail.code && (
                <>
                  <div className="section-label">源代码</div>
                  <pre
                    className="mono"
                    style={{
                      background: '#f7f6f1',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      overflow: 'auto',
                    }}
                  >
                    {detail.code}
                  </pre>
                </>
              )}
            </>
          )
        )}
      </Drawer>
    </div>
  )
}
