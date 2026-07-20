// 题目难度等级（参考洛谷分级，由低到高）。颜色按可读性微调，适合作为彩色粗体文字显示在浅色纸面背景上。
export const DIFFICULTIES = [
  { value: 'unrated', label: '暂无评定', color: '#8a9099' },
  { value: 'entry', label: '入门', color: '#e8484a' },
  { value: 'pop_minus', label: '普及−', color: '#e08e0b' },
  { value: 'pop', label: '普及/提高−', color: '#c79a00' },
  { value: 'pop_plus', label: '普及+/提高', color: '#2f9e44' },
  { value: 'imp_plus', label: '提高+/省选−', color: '#2b7fc4' },
  { value: 'provincial', label: '省选/NOI−', color: '#8e35c0' },
  { value: 'noi', label: 'NOI/NOI+/CTSC', color: '#1a2a6c' },
]

export const DIFFICULTY_MAP = Object.fromEntries(DIFFICULTIES.map((d) => [d.value, d]))

// 供 antd Select / 筛选使用的选项
export const DIFFICULTY_OPTIONS = DIFFICULTIES.map((d) => ({ value: d.value, label: d.label }))
