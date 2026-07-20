#!/bin/sh
# 后端容器入口：第一个参数决定角色。
#   web    -> 迁移数据库 + 收集静态文件 + (可选)初始化演示数据 + 启动 gunicorn
#   worker -> 启动 Celery worker（判题与邮件任务）
set -e

ROLE="${1:-web}"

if [ "$ROLE" = "web" ]; then
    echo "[entrypoint] 执行数据库迁移..."
    # 数据库刚就绪时偶尔仍会拒连，做几次重试更稳
    n=0
    until python manage.py migrate --noinput; do
        n=$((n + 1))
        if [ "$n" -ge 10 ]; then
            echo "[entrypoint] 迁移多次失败，退出。" >&2
            exit 1
        fi
        echo "[entrypoint] 迁移失败，5 秒后重试（$n/10）..."
        sleep 5
    done

    echo "[entrypoint] 收集静态文件（供 Nginx 提供 admin / DRF 资源）..."
    python manage.py collectstatic --noinput >/dev/null

    if [ "${SEED_DEMO:-0}" = "1" ]; then
        echo "[entrypoint] 初始化演示数据（幂等，可重复执行）..."
        python manage.py seed_demo || true
    fi

    echo "[entrypoint] 启动 gunicorn..."
    exec gunicorn config.wsgi:application \
        --bind 0.0.0.0:8000 \
        --workers "${GUNICORN_WORKERS:-3}" \
        --timeout 120

elif [ "$ROLE" = "worker" ]; then
    echo "[entrypoint] 启动 Celery worker..."
    exec celery -A config worker -l info --concurrency "${CELERY_CONCURRENCY:-2}"

else
    # 其他参数原样执行，便于调试（如 sh）
    exec "$@"
fi
