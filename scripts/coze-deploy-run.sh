#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 显式声明端口
export PORT=5000
# 允许绑定 0.0.0.0（部署环境需要）
export DEPLOY_BIND_ALL=1

# 清理 5000 端口残留进程（绝不碰 9000）
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# 启动后端服务，提供 API 和前端静态文件
# 后端绑定 0.0.0.0:5000，使用生产数据库
exec python3 run_simulation_service.py \
    --host 0.0.0.0 \
    --port 5000 \
    --database "$PROJECT_DIR/data/accident-simulation.sqlite3" \
    --static "$PROJECT_DIR/dashboard/dist"
