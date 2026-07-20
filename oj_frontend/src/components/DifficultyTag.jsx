import { DIFFICULTY_MAP } from '../utils/difficulty'

export default function DifficultyTag({ value }) {
  const d = DIFFICULTY_MAP[value] || { label: value || '—', color: 'var(--ink-soft)' }
  return <span style={{ color: d.color, fontWeight: 600 }}>{d.label}</span>
}
