# go-judge 判题沙箱 + 三语言工具链。
# go-judge（criyle/go-judge）通过 HTTP 接收源码/输入并在 namespace+cgroup+seccomp
# 隔离环境内编译、运行用户代码，因此编译器（g++ / OpenJDK / Python3）必须装在本镜像里。
# 适配器要求可执行文件位于 PATH=/usr/local/bin:/usr/bin:/bin（见 apps/judge/gojudge.py）。
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
# go-judge 版本（写明确版本便于复现；如需升级改这里或 .env 即可）
ARG GOJUDGE_VERSION=1.12.0

# —— 国内加速源（可在 .env 集中切换）——
ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn

# GitHub 下载代理。
#  GH_PROXY  ：单个代理，来自 .env / compose，会被“优先尝试”。留空则跳过。
#  GH_PROXIES：内置的备用代理清单（空格分隔），按顺序自动回退；末尾的 "-" 表示直连 github.com。
# 逻辑：先试 GH_PROXY，再依次试 GH_PROXIES 里的每一个，任一成功即停；全部失败才报错。
# 每个代理都必须以 / 结尾（直连用占位符 "-"）。若清单里的域名以后失效，
# 可到 https://ghproxy.link/ 查当前可用域名后替换。
ARG GH_PROXY=
ARG GH_PROXIES="https://github.akams.cn/ https://gh-proxy.com/ https://ghproxy.net/ https://ghfast.top/ -"

# 替换 Debian 软件源为国内镜像
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" \
            /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
        sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" \
            /etc/apt/sources.list 2>/dev/null || true; \
    fi && \
    apt-get update && apt-get install -y --no-install-recommends \
        g++ \
        openjdk-17-jdk-headless \
        python3 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

# 按 CPU 架构下载 go-judge 预编译二进制，逐个代理源自动回退：
#   x86-64 取 amd64v2（兼容 2009 年以后绝大多数 CPU 的基线微架构）
#   arm64  取 arm64（Apple/Surface 等 ARM）
# 关键改动：给 curl 加了 --connect-timeout / --max-time / --retry，
# 单个源失效会在 ~15 秒内快速失败并切下一个，而不是像之前那样卡满 300 秒才报 timeout。
RUN set -eu; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) asset="go-judge_${GOJUDGE_VERSION}_linux_amd64v2" ;; \
        arm64) asset="go-judge_${GOJUDGE_VERSION}_linux_arm64" ;; \
        *) echo "不支持的架构: $arch" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/criyle/go-judge/releases/download/v${GOJUDGE_VERSION}/${asset}"; \
    ok=0; \
    for p in $GH_PROXY $GH_PROXIES; do \
        [ "$p" = "-" ] && p=""; \
        url="${p}${base}"; \
        echo "==> 尝试下载 go-judge: ${url:-$base}"; \
        if curl -fL --connect-timeout 15 --max-time 300 --retry 2 --retry-delay 3 \
                "$url" -o /usr/local/bin/go-judge && [ -s /usr/local/bin/go-judge ]; then \
            ok=1; echo "==> 下载成功"; break; \
        fi; \
        echo "    该源失败，切换下一个..." >&2; \
        rm -f /usr/local/bin/go-judge; \
    done; \
    if [ "$ok" != "1" ]; then \
        echo "所有下载源均失败。请改用「离线放置二进制」方案：见随附说明。" >&2; \
        exit 1; \
    fi; \
    chmod +x /usr/local/bin/go-judge

EXPOSE 5050
# 监听所有网卡，供 worker 容器以 http://go-judge:5050 访问
CMD ["go-judge", "-http-addr", "0.0.0.0:5050"]
