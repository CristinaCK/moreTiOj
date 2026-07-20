import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOutlined,
  ProfileOutlined,
  ReloadOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons'

// 激励名句（经典/公有领域，中外皆有）。后台可增改名句的能力将随管理后台一并提供。
const QUOTES = [
  { text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '《荀子·劝学》' },
  { text: '学而不思则罔，思而不学则殆。', author: '《论语》' },
  { text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈' },
  { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游' },
  { text: '天行健，君子以自强不息。', author: '《周易》' },
  { text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
  { text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '《警世贤文》' },
  { text: '知之者不如好之者，好之者不如乐之者。', author: '《论语》' },
  { text: '千里之行，始于足下。', author: '《老子》' },
  { text: '锲而不舍，金石可镂。', author: '《荀子·劝学》' },
  { text: '天才是百分之一的灵感加上百分之九十九的汗水。', author: '爱迪生' },
  { text: '学习数学的唯一方法，就是动手去做数学。', author: '保罗·哈尔莫斯' },
]

const CARDS = [
  { to: '/problems', icon: <BookOutlined />, title: '题库探索', desc: '按算法分类系统刷题' },
  { to: '/contests', icon: <TrophyOutlined />, title: '比赛中心', desc: '参与实时编程竞赛' },
  { to: '/classes', icon: <TeamOutlined />, title: '班级作业', desc: '查看班级布置的作业' },
  { to: '/profile', icon: <ProfileOutlined />, title: '我的评测', desc: '查看历史提交与评测结果' },
]

export default function HomePage() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length))
  const quote = QUOTES[idx % QUOTES.length]
  const next = () => setIdx((i) => (i + 1) % QUOTES.length)

  return (
    <div className="page-container">
      <div className="home-hero">
        <div className="home-brand">
          墨题<span className="home-brand-dot">·</span>OJ
        </div>
        <blockquote className="home-quote">
          <p className="home-quote-text">{quote.text}</p>
          <p className="home-quote-author">—— {quote.author}</p>
        </blockquote>
        <button type="button" className="home-quote-refresh" onClick={next}>
          <ReloadOutlined /> 换一句
        </button>
      </div>

      <div className="home-cards">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="home-card">
            <span className="home-card-icon">{c.icon}</span>
            <span className="home-card-title">{c.title}</span>
            <span className="home-card-desc">{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
