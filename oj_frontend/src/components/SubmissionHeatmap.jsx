import { useMemo } from 'react'
import { Tooltip } from 'antd'
import dayjs from 'dayjs'

/**
 * GitHub 风格年度提交热力图（纯 CSS，无额外依赖）。
 * 采用「每周一列、列顶带月份标签」的稳健布局，避免 grid/flex 混排错位。
 * props.data：[{ date: 'YYYY-MM-DD', count: n }, ...]
 */
export default function SubmissionHeatmap({ data = [] }) {
  const { weeks, monthByCol, total } = useMemo(() => buildCalendar(data), [data])

  return (
    <div className="heatmap">
      <div className="heatmap-scroll">
        <div className="heatmap-body">
          <div className="heatmap-weekdays">
            <div className="hm-corner" />
            {['', '一', '', '三', '', '五', ''].map((d, i) => (
              <div className="hm-wd" key={i}>
                {d}
              </div>
            ))}
          </div>
          <div className="heatmap-cols">
            {weeks.map((week, wi) => (
              <div className="heatmap-col" key={wi}>
                <div className="hm-month">{monthByCol[wi] || ''}</div>
                {week.map((cell, di) =>
                  cell ? (
                    <Tooltip key={di} title={`${dayjs(cell.date).format('YYYY 年 M 月 D 日')} · ${cell.count} 次提交`}>
                      <div className={`heatmap-cell level-${cell.level}`} />
                    </Tooltip>
                  ) : (
                    <div key={di} className="heatmap-cell hm-empty" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend">
        <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>近一年 {total} 次提交</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>少</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div key={l} className={`heatmap-cell level-${l}`} />
        ))}
        <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>多</span>
      </div>
    </div>
  )
}

function levelOf(count) {
  if (!count) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

function buildCalendar(data) {
  const counts = {}
  data.forEach((d) => {
    if (!d?.date) return
    counts[d.date] = (counts[d.date] || 0) + (d.count || 0)
  })

  const today = dayjs().startOf('day')
  let start = today.subtract(364, 'day')
  start = start.subtract(start.day(), 'day') // 回退到周日，对齐列

  const weeks = []
  const monthByCol = {}
  let total = 0
  let cursor = start
  let lastMonth = -1
  let col = 0
  while (cursor.isBefore(today) || cursor.isSame(today)) {
    const week = []
    for (let d = 0; d < 7; d += 1) {
      if (cursor.isAfter(today)) {
        week.push(null)
      } else {
        const key = cursor.format('YYYY-MM-DD')
        const c = counts[key] || 0
        total += c
        week.push({ date: key, count: c, level: levelOf(c) })
        if (cursor.month() !== lastMonth) {
          lastMonth = cursor.month()
          // 仅在该月第一次出现时，于当前列顶标注月份
          if (monthByCol[col] === undefined) monthByCol[col] = `${cursor.month() + 1}月`
        }
      }
      cursor = cursor.add(1, 'day')
    }
    weeks.push(week)
    col += 1
  }
  return { weeks, monthByCol, total }
}
