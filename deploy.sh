#!/bin/bash
# ============================================================
# 2026 世界杯数据看板 - 部署脚本（裸机 VPS / 无需 Docker）
# 适用：任何装了 Node.js 18+ 的 Linux 服务器
# 用法：在服务器上 git clone 后执行 bash deploy.sh
# ============================================================
set -e

echo "⚽ 2026 世界杯数据看板 - 部署脚本"
echo "────────────────────────────────────"

# 检查 Node
if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js，请先安装 Node.js 18+"
  echo "   Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
echo "✓ Node.js: $(node -v)"

# 安装依赖
echo "📦 安装依赖..."
npm install --omit=dev

# 验证 skill-data 存在
if [ ! -d "skill-data/scripts" ]; then
  echo "❌ skill-data/scripts 不存在，请确认仓库完整"
  exit 1
fi
echo "✓ skill-data 就绪"

# 用 PM2 管理进程（推荐），没有则用 nohup
PORT="${PORT:-3000}"

if command -v pm2 &> /dev/null; then
  echo "🚀 使用 PM2 启动..."
  pm2 delete worldcup-dashboard 2>/dev/null || true
  pm2 start server.js --name worldcup-dashboard
  pm2 save
  echo "✓ PM2 已启动，端口 $PORT"
  echo "   查看日志: pm2 logs worldcup-dashboard"
  echo "   设置开机自启: pm2 startup && pm2 save"
else
  echo "🚀 使用 nohup 启动（建议安装 PM2: npm i -g pm2）..."
  nohup node server.js > app.log 2>&1 &
  echo $! > app.pid
  echo "✓ 已启动，PID: $(cat app.pid)，端口 $PORT"
  echo "   查看日志: tail -f app.log"
  echo "   停止: kill \$(cat app.pid)"
fi

echo ""
echo "────────────────────────────────────"
echo "✅ 部署完成！访问 http://localhost:$PORT"
echo "   外网访问需配置反向代理（nginx）指向 $PORT 端口"
