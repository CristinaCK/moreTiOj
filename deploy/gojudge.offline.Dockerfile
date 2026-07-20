# go-judge 判题沙箱 —— 离线版：不在构建时联网下载，改为 COPY 事先放好的二进制。
# 用法：
#   1) 在任意能访问 GitHub 的机器（或手机）下载对应架构的 go-judge：
#        amd64（Intel/AMD，你的机器就是这个）:
#          https://github.com/criyle/go-judge/releases/download/v1.12.0/go-judge_1.12.0_linux_amd64v2
#        arm64（Apple Silicon / 部分 ARM Windows）:
#          https://github.com/criyle/go-judge/releases/download/v1.12.0/go-judge_1.12.0_linux_arm64
#   2) 把下载到的文件“重命名为 go-judge”（去掉后缀），放到项目的 deploy/ 目录下，即 deploy/go-judge
#   3) 用这个 Dockerfile 构建：把 docker-compose.yml 里 go-judge 服务的
#        dockerfile: deploy/gojudge.Dockerfile
#      改成
#        dockerfile: deploy/gojudge.offline.Dockerfile
#      然后 docker compose up -d --build
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ARG APT_MIRROR=mirrors.tuna.tsinghua.edu.cn

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
    && rm -rf /var/lib/apt/lists/*

# 直接拷入事先下载好的二进制（放在 deploy/go-judge）
COPY deploy/go-judge /usr/local/bin/go-judge
RUN chmod +x /usr/local/bin/go-judge

EXPOSE 5050
CMD ["go-judge", "-http-addr", "0.0.0.0:5050"]
