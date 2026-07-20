import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { loader } from '@monaco-editor/react'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthContext'

// Monaco 编辑器改为从本站自身的 /vs 目录加载（构建时由 Dockerfile 拷入），
// 不再默认走公网 CDN（jsdelivr），确保内网/无外网环境下做题页可正常打开。
loader.config({ paths: { vs: '/vs' } })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#0d6e56',
          colorInfo: '#0d6e56',
          colorLink: '#0d6e56',
          borderRadius: 6,
          fontSize: 14,
          fontFamily:
            "-apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
)
