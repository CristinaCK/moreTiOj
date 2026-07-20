# 教学型 OJ 系统 · 后端

Django 5 + DRF + Celery + Redis + PostgreSQL 实现的在线评测系统后端。
对应需求文档 v1.1。

---

## ⚠️ 安全须知（务必先读）

`apps/judge/sandbox.py` 里的 **LocalSandbox 仅供本地开发**，它只做基本资源限制
（CPU / 内存 / 进程数 / 输出大小 / 墙钟超时），**不隔离文件系统、网络、系统调用**。

**绝不能用它在多用户 / 生产环境运行不可信代码。** 生产环境请切换到真实沙箱：
项目已内置 [go-judge](https://github.com/criyle/go-judge) 适配器（`apps/judge/gojudge.py`），
部署 go-judge 后在 `.env` 设 `JUDGE_SANDBOX=go-judge` 与 `GO_JUDGE_URL` 即可，上层判题逻辑无需改动。
**注意：该适配器按 go-judge 公开文档编写、未经实际联调**，启用前务必对照其当前版本文档核对字段并跑通自测流程。
SPJ 校验器目前仍在判题机本机运行（教师编写、风险较低），如需彻底隔离可参照适配器迁移。

---

## 本阶段已实现

- **账号与认证**：注册、**邮箱验证激活**、JWT 登录（未验证邮箱不能登录）、找回密码、个人信息读取/修改（含「赛后是否公开本人代码」偏好）。
- **题库**：题目列表 / 详情（按可见性过滤）；**题目创作 REST 接口**（教师创建，创建者/管理员编辑删除，标签自动建）；**`.in/.out` ZIP 批量上传**（自动配对、防 zip bomb、replace/append 两种模式）、测试点元信息查看、批量改分值/样例标记、删除测试点；Django Admin 仍可作备用入口。
- **提交与判题**：提交代码入队 → Celery 异步判题 → 编译 → 逐测试点运行 → 比对 / SPJ → 回写结果。
  - 支持 Python3 / Java / C++；
  - 给出**第一个未通过的测试点编号**；
  - 样例测试点回显输入/期望/实际输出，隐藏测试点只给编号与状态；
  - 比对策略：默认 / 严格 / 浮点；
  - **Special Judge**：出题人编写校验程序（testlib.h 风格 argv：`<input> <user_out> <answer>`，退出码 0=AC）。
- **竞赛**：竞赛列表/详情（按可见性过滤）、教师创建/编辑、报名（公开/密码/班级规则）、**私有赛邀请名单**（按用户名批量添加/移除并通知）、添加赛题、提交校验（进行中+已报名+题目属于该赛）、**实时排行榜（ACM 罚时 / OI 总分）+ 封榜**（最后 N 分钟榜单冻结、封榜后的提交只显示尝试数，比赛结束自动解榜；创建者/管理员始终看全榜）、赛后代码按作者个人设置公开。
- **班级/分组**：教师建班（生成邀请码）、学生凭邀请码加入、成员管理（查看/移除）、按班布置作业（题目集 + 截止时间）、加入/新作业自动通知。
- **消息通知**：通知列表 / 未读数 / 标记已读 / 全部已读，系统公告只读接口；`create_notification` / `bulk_notify` 工具供各模块复用。
- **题解**：发布前校验**已 AC 该题**；提交后进入待审核，管理员 REST 接口或后台**通过/驳回（附理由）**；**被驳回（或任意修改）后自动回到待审核**，可重投；审核结果自动通知作者；驳回理由仅作者与管理员可见。
- **讨论**：全站 + 题目讨论区（`?problem=`），先发后审；**楼层回复**（支持父回复，二级楼中楼）；回复自动维护回复数并通知主题/父回复作者；管理员处置（下架/恢复）。
- **全站排行榜**：`/api/ranking/` 按 AC 题数降序、提交数升序（无 Rating）；判题后自动维护用户 AC 题数（按题去重）与提交数。

## 下一阶段待补（均为可选增强）

判题状态 WebSocket 推送（当前轮询，本规模够用）；出题「试评测」（用标准程序跑一遍数据）；
竞赛防作弊（代码相似度检测）；SPJ 沙箱化执行；go-judge 适配器联调验证。

---

## 快速开始

### 1. 启动依赖（PostgreSQL + Redis）
```bash
docker compose up -d
```

### 2. 安装 Python 依赖
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 3. 配置环境变量
```bash
cp .env.example .env      # 按需修改；开发可保持默认
```

### 4. 建表 + 演示数据
```bash
python manage.py makemigrations
python manage.py migrate
python manage.py seed_demo          # 生成 admin/admin12345 + 示例题 #1
```

### 5. 启动服务（开两个终端）
```bash
# 终端 A：Web
python manage.py runserver

# 终端 B：判题 worker（本地判题需要本机装有 g++ / javac / python3）
celery -A config worker -l info -c 1
```

后台管理：<http://127.0.0.1:8000/admin/>（admin / admin12345）。

---

## 快速自测

```bash
# 1) 注册（开发环境验证邮件会打印在 runserver 终端，复制其中 token）
curl -X POST http://127.0.0.1:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"username":"stu","email":"stu@example.com","password":"Test12345!"}'

# 2) 邮箱验证
curl -X POST http://127.0.0.1:8000/api/auth/verify-email/ \
  -H "Content-Type: application/json" -d '{"token":"粘贴token"}'

# 3) 登录拿 access token
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"stu","password":"Test12345!"}'

# 4) 提交一份 A+B 解答（替换 <ACCESS>）
curl -X POST http://127.0.0.1:8000/api/submissions/ \
  -H "Authorization: Bearer <ACCESS>" -H "Content-Type: application/json" \
  -d '{"problem":"1","language":"python3","code":"a,b=map(int,input().split());print(a+b)"}'

# 5) 查看判题结果（替换 <ID>）
curl http://127.0.0.1:8000/api/submissions/<ID>/ -H "Authorization: Bearer <ACCESS>"
```

---

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register/` | 注册（触发验证邮件） |
| POST | `/api/auth/verify-email/` | 邮箱验证 |
| POST | `/api/auth/login/` | 登录（返回 JWT，需邮箱已验证） |
| POST | `/api/auth/token/refresh/` | 刷新 token |
| GET/PATCH | `/api/auth/me/` | 个人信息 / 设置 |
| POST | `/api/auth/password/reset/` | 申请重置密码 |
| POST | `/api/auth/password/reset/confirm/` | 确认重置 |
| GET | `/api/problems/` | 题目列表 |
| GET | `/api/problems/{display_id}/` | 题目详情 |
| POST | `/api/problems/` | 创建题目（教师；tags 传标签名列表） |
| PUT/PATCH/DELETE | `/api/problems/{display_id}/` | 编辑 / 删除（创建者或管理员） |
| GET | `/api/problems/{display_id}/testcases/` | 测试点元信息（创建者/管理员） |
| POST | `/api/problems/{display_id}/upload-testcases/` | ZIP 批量上传 .in/.out（`file` + `mode=replace\|append`） |
| PATCH | `/api/problems/{display_id}/update-testcases/` | 批量改分值 / 样例标记 |
| POST | `/api/problems/{display_id}/delete-testcases/` | 删除测试点（可指定 indexes） |
| GET/POST | `/api/submissions/` | 提交列表 / 创建提交（可带 contest） |
| GET | `/api/submissions/{id}/` | 提交详情（源代码按权限可见） |
| GET/POST | `/api/contests/` | 竞赛列表 / 创建（教师） |
| GET/PUT | `/api/contests/{id}/` | 竞赛详情 / 编辑 |
| POST | `/api/contests/{id}/register/` | 报名（密码/班级按需校验） |
| POST | `/api/contests/{id}/add_participants/` · `remove_participant/` | 私有赛名单管理（创建者/管理员） |
| POST | `/api/contests/{id}/add_problem/` | 添加赛题（教师） |
| GET | `/api/contests/{id}/leaderboard/` | 实时排行榜 |
| GET/POST | `/api/classes/` | 我的班级 / 建班（教师） |
| POST | `/api/classes/join/` | 凭邀请码加入 |
| GET | `/api/classes/{id}/members/` | 成员列表 |
| POST | `/api/classes/{id}/remove_member/` | 移除成员（教师） |
| GET/POST | `/api/classes/{id}/assignments/` | 作业列表 / 布置（教师） |
| GET | `/api/notifications/` | 我的通知（`?unread=1` 仅未读） |
| GET | `/api/notifications/unread_count/` | 未读数 |
| POST | `/api/notifications/{id}/read/` · `/api/notifications/read_all/` | 标记已读 |
| GET | `/api/announcements/` | 系统公告 |
| GET/POST | `/api/solutions/` | 题解列表（`?problem=` / `?mine=1` / 管理员 `?status=pending` 审核队列）/ 发布（需已 AC） |
| GET/PUT/DELETE | `/api/solutions/{id}/` | 题解详情 / 修改（自动回到待审核）/ 删除 |
| POST | `/api/solutions/{id}/approve/` · `/api/solutions/{id}/reject/` | 审核通过 / 驳回（管理员，驳回可带 `reason`） |
| GET/POST | `/api/discussions/` | 讨论列表（`?problem=` `?category=` `?search=`）/ 发帖 |
| GET/PUT/DELETE | `/api/discussions/{id}/` | 讨论详情 / 修改 / 删除 |
| GET/POST | `/api/discussions/{id}/replies/` | 楼层回复列表 / 回复（可带 `parent`） |
| DELETE | `/api/discussion-replies/{id}/` | 删除回复（作者/管理员） |
| POST | `/api/discussions/{id}/moderate/` | 管理员处置（published/rejected/pending） |
| GET | `/api/ranking/` | 全站排行榜（按 AC 题数） |

---

## 语言注意事项

- **Java**：类名必须为 `Main`（系统按 `Main.java` 编译运行）；内存用 `-Xmx` 控制，不走地址空间 rlimit（避免误杀 JVM）。
- **C++**：`g++ -O2 -std=c++17` 编译。
- **Python3**：直接运行 `main.py`。
- 各语言时间/内存倍率在 `apps/judge/languages.py` 调整。

## 目录结构

```
config/            # 工程配置（settings/urls/celery/wsgi/asgi）
apps/
  accounts/        # 用户、JWT、邮箱验证、找回密码
  problems/        # 题目、标签、测试点（+ seed_demo 命令）
  submissions/     # 提交、测试点结果、判题任务派发
  judge/           # 判题核心：状态码/语言/比对/沙箱/编排
  contests/        # 竞赛：报名、赛题、排行榜（ACM/OI）
  classes/         # 班级、成员、作业（建班/加入/布置）
  discussions/     # 讨论：发帖、楼层回复、回复提醒、管理员处置
  solutions/       # 题解：AC 前置、审核流（通过/驳回/重投）
  notifications/   # 通知、公告（读取接口 + 创建工具）
```
