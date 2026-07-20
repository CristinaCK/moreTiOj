# 墨题·OJ

面向教学的在线评测系统（Online Judge）。支持题库与自动判题、竞赛、班级作业、讨论与题解、细粒度权限与管理后台，采用 Docker Compose 一体化部署，可在局域网 / 无外网环境中稳定运行。

---

## ✨ 功能特性

- **题库与判题**：多测试点评测，支持捆绑测试 / 子任务组；比对支持忽略行末空格 / 严格逐字节 / 浮点误差；支持 Special Judge。判题语言为 Python 3 与 C++。
- **题型**：标准题 + 程序填空题（`__1__` 挖空，支持文本比对或评测机判定）。
- **在线运行**：题面内可用自定义输入自测，不计入提交。
- **竞赛**：ACM / OI 两种赛制，报名可设公开 / 密码 / 指定班级 / 定向邀请；支持罚时、封榜；可按场开启「赛中隐藏成绩与榜单」。
- **班级教学**：班级、成员批量导入、作业发布、作业排行榜，教师可查看学生提交与源代码。
- **账号与权限**：管理员统一建号 / 批量建号 / 重置密码（已关闭自助注册与改密）；细粒度权限开关（出题 / 管理所有题目 / 审核题解）；用户名支持中文并可展示真实姓名。
- **其它**：讨论区、题解与审核、站内通知与公告、个人主页统计、洛谷风格难度分级。

> 题号由系统**自动分配**（从 `00001` 起递增），出题时只读、不可人为修改。

## 🧱 技术栈

- **后端**：Python / Django 5 + Django REST Framework，JWT 认证（SimpleJWT），Celery + Redis 异步判题，PostgreSQL；判题沙箱 LocalSandbox（开发）/ go-judge（生产）。
- **前端**：React 18 + Vite + Ant Design 5，Monaco 编辑器，react-markdown + KaTeX，react-router v6，axios。
- **部署**：Docker Compose（`postgres` / `redis` / `go-judge` / `backend` / `worker` / `frontend`）。前端资源（Monaco、字体）全部本地化，不依赖公网 CDN。

## 🚀 快速开始

> 前置条件：已安装 Docker 与 Docker Compose（Windows 用 Docker Desktop）。

```bash
# 1. 准备配置：复制模板为 .env，按需修改端口、密钥、数据库密码、允许的主机名等
cp .env.example .env        # Windows(PowerShell): copy .env.example .env

# 2. 一键构建并启动（首次会自动建库、迁移、灌演示数据）
docker compose up -d --build

# 3. 浏览器访问 http://localhost:8080
#    初始管理员：admin / admin12345（生产环境请立即改密，或新建管理员后停用）
```

### 局域网 / 多机访问

若需让同一局域网内其它机器通过服务器 IP 访问，编辑 `.env`，把下列三项改为服务器实际 IP（示例 `192.168.1.100`）：

```ini
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend,192.168.1.100
DJANGO_CSRF_TRUSTED_ORIGINS=http://192.168.1.100:8080
FRONTEND_URL=http://192.168.1.100:8080
```

改完执行 `docker compose up -d --build` 生效。其它机器访问 `http://192.168.1.100:8080` 即可。

### 常用运维命令

```bash
docker compose up -d --build     # 启动 / 升级（保留数据；改完代码或 .env 后执行）
docker compose down              # 停止（保留数据）
docker compose logs -f backend   # 查看后端日志（排查启动/登录问题时用）
docker compose down -v           # ⚠️ 清空所有数据（数据库、题目、测试点）后重来，慎用
```

## 📁 项目结构

```
oj_platform/
├─ oj_backend/            Django 后端（config 配置 + apps 业务模块 + 判题核心）
├─ oj_frontend/           React 前端（src 源码，Vite 构建）
├─ deploy/                Dockerfile、nginx.conf、入口脚本、镜像加速示例
├─ docker-compose.yml     六个服务的编排
├─ .env.example           环境变量模板（复制为 .env 使用）
├─ .gitignore             忽略 .env、媒体数据、构建产物等
├─ README.md              本文件
├─ 开发文档.md            架构 / 数据模型 / API / 判题机制 / 二次开发指引
└─ CHANGELOG.md           版本更新日志
```

## ⚙️ 配置说明

所有后端配置经环境变量驱动，样例见 `.env.example`。常用项：对外端口 `HTTP_PORT`、密钥 `DJANGO_SECRET_KEY`、允许主机 `DJANGO_ALLOWED_HOSTS`、跨站信任来源 `DJANGO_CSRF_TRUSTED_ORIGINS`、数据库 `POSTGRES_*`、首次是否灌演示数据 `SEED_DEMO`。国内构建加速项（`APT_MIRROR` / `PIP_INDEX_URL` / `NPM_REGISTRY` / `GH_PROXY`）也在其中。完整表格见 `开发文档.md` 第 9 节。

## 🔒 数据与备份

- **本仓库只保存源代码与配置模板**。`.env`（含密钥）与 `oj_backend/media/`（上传/生成的测试数据）已在 `.gitignore` 中排除，**不会**进入 Git。
- **业务数据**（题目、提交、测试点文件、用户等）保存在 Docker 命名卷（`pg_data` / `media` / …）中，位于服务器本机，与代码仓库相互独立。如需备份数据，请单独备份这些卷或做数据库导出。
- 你的真实 `.env` 请在本地另行妥善保存（勿提交到公开仓库）。

## 📖 文档

- 架构与二次开发：[`开发文档.md`](./开发文档.md)（含数据模型、API、判题机制、部署细节、扩展指引）
- 更新日志：[`CHANGELOG.md`](./CHANGELOG.md)

## 📝 许可证

内部教学使用。如需开源发布，请在此处补充 `LICENSE`（例如 MIT）。
