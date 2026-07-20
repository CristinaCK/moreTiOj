import { useCallback, useEffect, useState } from 'react'
import { Button, Input, message, Modal, Table, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../api'
import { errMsg } from '../api'
import { useAuth } from '../auth/AuthContext'
import { CONTEST_STATUS, durationText } from '../utils/contest'

export default function ContestListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState({ results: [], count: 0 })
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pwModal, setPwModal] = useState({ open: false, contest: null, password: '' })

  const fetchData = useCallback(() => {
    setLoading(true)
    api
      .listContests({ page })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const doRegister = async (contest, password) => {
    try {
      const res = await api.registerContest(contest.id, password)
      message.success(res.detail || '报名成功')
      setPwModal({ open: false, contest: null, password: '' })
      fetchData()
    } catch (e) {
      message.error(errMsg(e, '报名失败'))
    }
  }

  const onRegisterClick = (e, contest) => {
    e.stopPropagation()
    if (!user) {
      message.warning('请先登录')
      return
    }
    if (contest.visibility === 'password') setPwModal({ open: true, contest, password: '' })
    else doRegister(contest)
  }

  const columns = [
    {
      title: '竞赛名称',
      dataIndex: 'title',
      render: (v) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '赛制',
      dataIndex: 'rule_type',
      width: 90,
      render: (v) => <Tag bordered={false}>{v === 'acm' ? 'ACM' : 'OI'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v) => <Tag color={(CONTEST_STATUS[v] || {}).color}>{(CONTEST_STATUS[v] || {}).label || v}</Tag>,
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      width: 170,
      className: 'mono',
      render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '时长',
      width: 110,
      render: (_, r) => durationText(r.start_time, r.end_time),
    },
    { title: '人数', dataIndex: 'participant_count', width: 80, className: 'mono' },
    {
      title: '报名',
      width: 110,
      render: (_, r) => {
        if (r.is_registered) return <Tag color="success">已报名</Tag>
        if (r.status === 'ended' || r.visibility === 'private') return null
        return (
          <Button size="small" onClick={(e) => onRegisterClick(e, r)}>
            报名
          </Button>
        )
      },
    },
  ]

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 className="page-title">竞赛</h1>
        {user?.is_teacher && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/contests/new')}>
            创建竞赛
          </Button>
        )}
      </div>
      <div className="card">
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={data.results}
          onRow={(record) => ({
            onClick: () => navigate(`/contests/${record.id}`),
            className: 'clickable-row',
          })}
          pagination={{
            current: page,
            total: data.count,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
        />
      </div>
      <Modal
        title={`报名：${pwModal.contest?.title || ''}`}
        open={pwModal.open}
        onCancel={() => setPwModal({ open: false, contest: null, password: '' })}
        onOk={() => doRegister(pwModal.contest, pwModal.password)}
        okText="确认报名"
      >
        <Input.Password
          placeholder="请输入报名密码"
          value={pwModal.password}
          onChange={(e) => setPwModal({ ...pwModal, password: e.target.value })}
        />
      </Modal>
    </div>
  )
}
