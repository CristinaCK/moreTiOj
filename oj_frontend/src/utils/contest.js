import dayjs from 'dayjs'

export const CONTEST_STATUS = {
  upcoming: { label: '即将开始', color: 'blue' },
  running: { label: '进行中', color: 'green' },
  ended: { label: '已结束', color: 'default' },
}

export const ruleLabel = (rule) => (rule === 'acm' ? 'ACM/ICPC 赛制' : 'OI 赛制')

export const visibilityLabel = (v) =>
  ({ public: '公开', password: '密码报名', class: '指定班级', private: '私有（定向邀请）' }[v] || v)

/** 把两个时间点的差转成「X 时 Y 分 Z 秒」倒计时文案；负数归零。 */
export function formatCountdown(target) {
  const diff = dayjs(target).diff(dayjs(), 'second')
  if (diff <= 0) return '00:00:00'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  const pad = (n) => String(n).padStart(2, '0')
  const hms = `${pad(h)}:${pad(m)}:${pad(s)}`
  return d > 0 ? `${d} 天 ${hms}` : hms
}

export const durationText = (start, end) => {
  const minutes = dayjs(end).diff(dayjs(start), 'minute')
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}
