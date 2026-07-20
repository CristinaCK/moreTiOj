import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  InputNumber,
  Popconfirm,
  Radio,
  Space,
  Spin,
  Switch,
  Table,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import { InboxOutlined, SaveOutlined } from '@ant-design/icons'
import * as api from '../../api'
import { errMsg } from '../../api'

function humanSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function TestcasePanel({ displayId }) {
  const [cases, setCases] = useState(null)
  const [edits, setEdits] = useState({}) // index -> {score, is_sample}
  const [fileList, setFileList] = useState([])
  const [mode, setMode] = useState('replace')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkScore, setBulkScore] = useState(10)
  const [bulkGroup, setBulkGroup] = useState(1)

  const fetchCases = useCallback(() => {
    api
      .listTestcases(displayId)
      .then((d) => {
        setCases(d || [])
        setEdits({})
      })
      .catch(() => setCases([]))
  }, [displayId])

  useEffect(() => {
    fetchCases()
  }, [fetchCases])

  const doUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择 ZIP 文件')
      return
    }
    const fd = new FormData()
    fd.append('file', fileList[0])
    fd.append('mode', mode)
    setUploading(true)
    try {
      const res = await api.uploadTestcases(displayId, fd)
      message.success(res.detail || '导入完成')
      if (res.incomplete_skipped?.length) {
        message.warning(`已跳过残缺配对：${res.incomplete_skipped.join('、')}`)
      }
      setFileList([])
      fetchCases()
    } catch (e) {
      message.error(errMsg(e, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  const setEdit = (index, key, value) => {
    setEdits((prev) => ({ ...prev, [index]: { ...prev[index], [key]: value } }))
  }
  const valOf = (row, key) => (edits[row.index]?.[key] !== undefined ? edits[row.index][key] : row[key])

  // 一键：把所有测试点的分值设为 bulkScore（仅改本地，仍需点保存生效）
  const applyAllScore = () => {
    setEdits((prev) => {
      const next = { ...prev }
      ;(cases || []).forEach((c) => {
        next[c.index] = { ...next[c.index], score: bulkScore }
      })
      return next
    })
  }
  // 一键：把所有测试点设为样例可见 / 全部隐藏
  const applyAllSample = (val) => {
    setEdits((prev) => {
      const next = { ...prev }
      ;(cases || []).forEach((c) => {
        next[c.index] = { ...next[c.index], is_sample: val }
      })
      return next
    })
  }
  // 一键：把所有测试点设为同一子任务组
  const applyAllGroup = () => {
    setEdits((prev) => {
      const next = { ...prev }
      ;(cases || []).forEach((c) => {
        next[c.index] = { ...next[c.index], group: bulkGroup }
      })
      return next
    })
  }

  const saveMeta = async () => {
    const items = Object.entries(edits).map(([index, patch]) => {
      const row = cases.find((c) => c.index === Number(index))
      return {
        index: Number(index),
        score: patch.score !== undefined ? patch.score : row.score,
        is_sample: patch.is_sample !== undefined ? patch.is_sample : row.is_sample,
        group: patch.group !== undefined ? patch.group : (row.group || 0),
      }
    })
    if (items.length === 0) {
      message.info('没有需要保存的修改')
      return
    }
    setSaving(true)
    try {
      await api.updateTestcases(displayId, items)
      message.success('测试点信息已保存')
      fetchCases()
    } catch (e) {
      message.error(errMsg(e, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  const deleteOne = async (index) => {
    try {
      await api.deleteTestcases(displayId, [index])
      message.success(`已删除测试点 #${index}`)
      fetchCases()
    } catch (e) {
      message.error(errMsg(e, '删除失败'))
    }
  }

  const clearAll = async () => {
    try {
      const res = await api.deleteTestcases(displayId)
      message.success(`已清空 ${res.deleted || 0} 个测试点`)
      fetchCases()
    } catch (e) {
      message.error(errMsg(e, '清空失败'))
    }
  }

  const columns = [
    { title: '#', dataIndex: 'index', width: 60, className: 'mono' },
    { title: '输入大小', dataIndex: 'input_size', width: 110, className: 'mono', render: humanSize },
    { title: '输出大小', dataIndex: 'output_size', width: 110, className: 'mono', render: humanSize },
    {
      title: '分值（OI）',
      dataIndex: 'score',
      width: 120,
      render: (_, r) => (
        <InputNumber min={0} value={valOf(r, 'score')} onChange={(v) => setEdit(r.index, 'score', v ?? 0)} style={{ width: 90 }} />
      ),
    },
    {
      title: (
        <Tooltip title="同一组（>0）为捆绑子任务：整组测试点全部通过才得该组分；0 表示独立计分">
          子任务组
        </Tooltip>
      ),
      dataIndex: 'group',
      width: 110,
      render: (_, r) => (
        <InputNumber
          min={0}
          value={valOf(r, 'group')}
          onChange={(v) => setEdit(r.index, 'group', v ?? 0)}
          style={{ width: 80 }}
        />
      ),
    },
    {
      title: '样例 / 可见',
      dataIndex: 'is_sample',
      width: 120,
      render: (_, r) => (
        <Switch
          size="small"
          checked={valOf(r, 'is_sample')}
          checkedChildren="样例"
          unCheckedChildren="隐藏"
          onChange={(v) => setEdit(r.index, 'is_sample', v)}
        />
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_, r) => (
        <Popconfirm title={`删除测试点 #${r.index}？`} okText="删除" okButtonProps={{ danger: true }} onConfirm={() => deleteOne(r.index)}>
          <Button type="link" size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const dirty = Object.keys(edits).length > 0

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="测试数据以 ZIP 批量上传"
        description="ZIP 内放成对的 1.in / 1.out、2.in / 2.out …（可带子目录，按文件名自动配对，数字序号自然排序）。「样例 / 可见」开启的测试点失败时会向学生展示输入输出对照，隐藏测试点只显示编号与结果。"
      />

      <div className="section-label" style={{ marginTop: 0 }}>
        上传测试数据
      </div>
      <Upload.Dragger
        accept=".zip"
        maxCount={1}
        fileList={fileList.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' }))}
        beforeUpload={(file) => {
          setFileList([file])
          return false
        }}
        onRemove={() => setFileList([])}
        style={{ marginBottom: 12 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ color: 'var(--pine)' }} />
        </p>
        <p className="ant-upload-text">点击或拖拽 ZIP 文件到此处</p>
        <p className="ant-upload-hint" style={{ fontSize: 12 }}>
          上限 100MB，单文件 64MB，解压总量 256MB
        </p>
      </Upload.Dragger>
      <Space style={{ marginBottom: 8 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} optionType="button" buttonStyle="solid">
          <Radio.Button value="replace">清空重建</Radio.Button>
          <Radio.Button value="append">追加</Radio.Button>
        </Radio.Group>
        <Button type="primary" loading={uploading} onClick={doUpload}>
          上传并导入
        </Button>
      </Space>

      <div className="section-label">已有测试点（{cases?.length ?? 0}）</div>
      {cases === null ? (
        <Spin />
      ) : cases.length === 0 ? (
        <Empty description="尚未上传测试数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <div className="bulk-toolbar">
            <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>一键设置：</span>
            <InputNumber min={0} value={bulkScore} onChange={(v) => setBulkScore(v ?? 0)} style={{ width: 90 }} />
            <Button size="small" onClick={applyAllScore}>
              全部分值设为此值
            </Button>
            <span style={{ color: 'var(--line)' }}>|</span>
            <InputNumber min={0} value={bulkGroup} onChange={(v) => setBulkGroup(v ?? 0)} style={{ width: 80 }} />
            <Button size="small" onClick={applyAllGroup}>
              全部设为此组
            </Button>
            <span style={{ color: 'var(--line)' }}>|</span>
            <Button size="small" onClick={() => applyAllSample(true)}>
              全部设为样例
            </Button>
            <Button size="small" onClick={() => applyAllSample(false)}>
              全部设为隐藏
            </Button>
            <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>（改完记得点下方“保存”）</span>
          </div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '0 0 8px' }}>
            捆绑测试：把若干测试点设为同一「子任务组」（&gt;0），该组只有<strong>全部通过</strong>才计该组分数，
            任一失败则该组 0 分；组号填 0 表示独立计分（逐点给分）。
          </Typography.Paragraph>
          <Table rowKey="index" size="small" columns={columns} dataSource={cases} pagination={false} />
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 12, gap: 10 }}>
            <Button type="primary" ghost icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={saveMeta}>
              保存分值 / 子任务 / 样例
            </Button>
            {dirty && <Typography.Text type="warning">有未保存的修改</Typography.Text>}
            <span style={{ flex: 1 }} />
            <Popconfirm title="清空全部测试点？此操作不可恢复。" okText="清空" okButtonProps={{ danger: true }} onConfirm={clearAll}>
              <Button danger>清空全部</Button>
            </Popconfirm>
          </div>
        </>
      )}
    </div>
  )
}
