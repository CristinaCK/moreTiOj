export const VERDICTS = {
  pending: { label: '等待中', color: 'default' },
  judging: { label: '判题中', color: 'processing' },
  accepted: { label: '通过', color: 'success' },
  wa: { label: '答案错误', color: 'error' },
  tle: { label: '运行超时', color: 'warning' },
  mle: { label: '内存超限', color: 'warning' },
  re: { label: '运行时错误', color: 'volcano' },
  ce: { label: '编译错误', color: 'magenta' },
  pe: { label: '格式错误', color: 'gold' },
  ole: { label: '输出超限', color: 'warning' },
  se: { label: '系统错误', color: 'default' },
  // 竞赛进行中对普通选手封存的提交：只显示“已提交”，不暴露评测结果
  sealed: { label: '已提交', color: 'blue' },
}

export const verdictOf = (status) => VERDICTS[status] || { label: status, color: 'default' }

export const isFinal = (status) => !['pending', 'judging'].includes(status)
