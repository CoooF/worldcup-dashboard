#!/bin/bash
# macOS 双击启动 2026 世界杯数据看板
cd "$(dirname "$0")"
echo "⚽ 启动 2026 世界杯数据看板..."
node server.js &
SERVER_PID=$!
sleep 1.5
# 自动打开浏览器
open "http://localhost:3000"
# 等待服务退出
wait $SERVER_PID
