import { Tag } from 'antd'
import { verdictOf } from '../utils/verdict'

export default function VerdictTag({ status }) {
  const v = verdictOf(status)
  return <Tag color={v.color}>{v.label}</Tag>
}
