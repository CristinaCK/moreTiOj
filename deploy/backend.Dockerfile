# 后端镜像：Django（gunicorn）与 Celery worker 共用同一镜像。
# 之所以装 g++：特判(SPJ)校验器目前由 runner 在 worker 本机用 subprocess
# 编译/运行（见 apps/judge/runner.py），故 worker 需要本地 C++ 工具链；
# python3 即镜像自带解释器，可直接跑 python 版 SPJ。
# 普通用户代码的编译与运行不在此镜像内，而是交给 go-judge 沙箱容器。
FROM python:3.12-slim

# —— 国内加速源（可在 .env 集中切换；境外构建可置空改回上游）——
ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 替换 Debian 软件源为国内镜像（兼容 bookworm 的 deb822 与旧式 sources.list）
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" \
            /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
        sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" \
            /etc/apt/sources.list 2>/dev/null || true; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
        g++ \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖，利用分层缓存（pip 走国内索引）
COPY oj_backend/requirements.txt /app/requirements.txt
RUN pip install -i "$PIP_INDEX_URL" -r /app/requirements.txt gunicorn

# 拷入后端源码（业务代码未做任何改动）
COPY oj_backend/ /app/

# 入口脚本：按角色启动 web 或 worker
COPY deploy/backend-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# 默认以 web 角色启动；worker 服务在 compose 中用 command: worker 覆盖
CMD ["web"]
