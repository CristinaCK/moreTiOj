// 复制文本到剪贴板，兼容“非安全上下文”。
// 背景：浏览器只在 HTTPS 或 http://localhost 下暴露 navigator.clipboard；
// 通过局域网 http://192.168.x.x:8080 访问时它是 undefined，导致原来的
// navigator.clipboard?.writeText(...) 被可选链静默吞掉、点击复制“毫无反应”。
// 这里优先用标准 API，不可用或失败时回退到 execCommand('copy') 的兜底方案。
export async function copyText(text) {
  const value = text == null ? '' : String(text)

  // 1) 安全上下文（https / localhost）下的标准异步 API
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      /* 继续走兜底 */
    }
  }

  // 2) 兜底：临时 textarea + execCommand('copy')，适用于 http 局域网访问
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
