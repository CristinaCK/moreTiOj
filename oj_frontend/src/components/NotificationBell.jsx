import { useEffect, useState } from 'react'
import { Badge, Button, Empty, List, Popover, Typography } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import * as api from '../api'

const TYPE_COLOR = {
  system: '#61695f',
  audit: '#c98a12',
  contest: '#0d6e56',
  class: '#2f6fae',
  reply: '#8a5cc9',
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)

  const fetchCount = () => {
    api.unreadCount().then((d) => setCount(d.unread)).catch(() => {})
  }

  useEffect(() => {
    fetchCount()
    const timer = setInterval(fetchCount, 60000)
    return () => clearInterval(timer)
  }, [])

  const onOpenChange = (next) => {
    setOpen(next)
    if (next) {
      api
        .listNotifications()
        .then((d) => setItems(d.results || []))
        .catch(() => {})
    }
  }

  const markAll = async () => {
    try {
      await api.readAllNotifications()
      setCount(0)
      setItems(items.map((i) => ({ ...i, is_read: true })))
    } catch (e) {
      /* 忽略 */
    }
  }

  const onItemClick = async (item) => {
    if (!item.is_read) {
      api.readNotification(item.id).then(fetchCount).catch(() => {})
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, is_read: true } : i)))
    }
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  const content = (
    <div style={{ width: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Typography.Text strong>消息通知</Typography.Text>
        <Button size="small" type="link" onClick={markAll}>
          全部已读
        </Button>
      </div>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
      ) : (
        <List
          size="small"
          dataSource={items.slice(0, 10)}
          renderItem={(item) => (
            <List.Item
              className={item.link ? 'clickable-row' : ''}
              style={{ opacity: item.is_read ? 0.55 : 1 }}
              onClick={() => onItemClick(item)}
            >
              <List.Item.Meta
                avatar={
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      marginTop: 6,
                      background: TYPE_COLOR[item.type] || '#61695f',
                    }}
                  />
                }
                title={<span style={{ fontSize: 13 }}>{item.title}</span>}
                description={
                  <span style={{ fontSize: 12 }}>
                    {item.content ? `${item.content} · ` : ''}
                    {dayjs(item.created_at).format('MM-DD HH:mm')}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={onOpenChange}>
      <Badge count={count} size="small">
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer', color: '#61695f' }} />
      </Badge>
    </Popover>
  )
}
