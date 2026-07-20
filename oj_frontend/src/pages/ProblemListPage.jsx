import { useCallback, useEffect, useState } from 'react'
import { DIFFICULTY_OPTIONS } from '../utils/difficulty'
import { CheckCircleFilled, MinusCircleFilled } from '@ant-design/icons'
import { Input, Segmented, Select, Space, Table, Tag } from 'antd'
import { Link } from 'react-router-dom'
import * as api from '../api'
import DifficultyTag from '../components/DifficultyTag'
import { useAuth } from '../auth/AuthContext'
import { canManageProblems } from '../utils/perm'

const STATUS_ICON = {
  solved: <CheckCircleFilled style={{ color: 'var(--easy)', fontSize: 16 }} />,
  attempted: <MinusCircleFilled style={{ color: 'var(--medium)', fontSize: 16 }} />,
  none: null,
}

export default function ProblemListPage() {
  const { user } = useAuth()
  // 教师及以上可查看「学业水平测试题（程序填空）」分类；常规用户仅见「算法题」
  const canSeeExam = canManageProblems(user) || user?.is_teacher
  const [category, setCategory] = useState('standard')
  const isExam = category === 'cloze'

  const [data, setData] = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState()

  const fetchData = useCallback(() => {
    setLoading(true)
    api
      .listProblems({ page, search: search || undefined, difficulty, problem_type: category })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, search, difficulty, category])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const columns = [
    {
      title: '状态',
      dataIndex: 'user_status',
      width: 64,
      align: 'center',
      render: (v) => STATUS_ICON[v] || null,
    },
    { title: '题号', dataIndex: 'display_id', width: 90, className: 'mono' },
    {
      title: '标题',
      dataIndex: 'title',
      render: (v, r) => (
        <Link to={`/problems/${r.display_id}`} style={{ fontWeight: 500 }}>
          {v}
        </Link>
      ),
    },
    // 算法题展示标签与难度；学业水平测试题不展示
    ...(isExam
      ? []
      : [
          {
            title: '标签',
            dataIndex: 'tags',
            width: 220,
            render: (tags) => (
              <>
                {(tags || []).slice(0, 3).map((t) => (
                  <Tag key={t.id} bordered={false}>
                    {t.name}
                  </Tag>
                ))}
              </>
            ),
          },
        ]),
    {
      title: '通过率',
      dataIndex: 'accept_rate',
      width: 100,
      className: 'mono',
      render: (v) => `${v}%`,
    },
    ...(isExam
      ? []
      : [
          {
            title: '难度',
            dataIndex: 'difficulty',
            width: 90,
            render: (v) => <DifficultyTag value={v} />,
          },
        ]),
  ]

  return (
    <div className="page-container">
      <h1 className="page-title">题库</h1>
      <div className="card">
        {canSeeExam && (
          <Segmented
            style={{ marginBottom: 14 }}
            value={category}
            onChange={(v) => {
              setCategory(v)
              setPage(1)
              setDifficulty(undefined)
            }}
            options={[
              { value: 'standard', label: '算法题' },
              { value: 'cloze', label: '学业水平测试题' },
            ]}
          />
        )}
        <Space style={{ marginBottom: 14, display: 'flex' }} wrap>
          <Input.Search
            placeholder="按题号 / 标题搜索"
            allowClear
            style={{ width: 260 }}
            onSearch={(v) => {
              setPage(1)
              setSearch(v.trim())
            }}
          />
          {!isExam && (
            <Select
              placeholder="难度"
              allowClear
              style={{ width: 150 }}
              value={difficulty}
              onChange={(v) => {
                setPage(1)
                setDifficulty(v)
              }}
              options={DIFFICULTY_OPTIONS}
            />
          )}
        </Space>
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={data.results}
          pagination={{
            current: page,
            total: data.count,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </div>
    </div>
  )
}
