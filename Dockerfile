# 2026 世界杯数据看板 - Docker 镜像
# 轻量级 Node.js 镜像，自包含 skill 脚本
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 先复制 package 文件，利用 Docker 层缓存
COPY package.json package-lock.json* ./

# 安装生产依赖（axios 等）
RUN npm ci --omit=dev || npm install --omit=dev

# 复制项目文件（skill-data 已含 skill 脚本，public 含前端）
COPY server.js ./
COPY public ./public
COPY skill-data ./skill-data
COPY start.command ./

# 暴露端口（Render/云平台通过 PORT 环境变量注入）
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# 启动
CMD ["node", "server.js"]
