# 前端镜像：多阶段构建。
# 阶段一用 Node 把 React/Vite 项目打包成静态文件；
# 阶段二用 Nginx 托管这些静态文件，并把 /api、/admin 反向代理到后端。
FROM node:20-slim AS build
WORKDIR /app

# —— 国内加速源（npmmirror 淘宝源；可在 .env 切换）——
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 先装依赖（无 lockfile 时用 npm install），利用分层缓存
COPY oj_frontend/package.json /app/package.json
RUN npm install --no-audit --no-fund --registry="$NPM_REGISTRY"

# 拷入源码并构建（node_modules 已被 .dockerignore 排除，不会覆盖）
COPY oj_frontend/ /app/
RUN npm run build

# 把 Monaco 编辑器本体（含语言 worker）拷进构建产物，供本站 /vs 直接提供，
# 前端已通过 loader.config({ paths: { vs: '/vs' } }) 指向这里，彻底不依赖公网 CDN。
RUN cp -r node_modules/monaco-editor/min/vs /app/dist/vs

# ---- 运行阶段 ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
