#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 显式声明关键环境变量
export PORT=5000
export VITE_SIMULATION_API_BASE_URL="http://127.0.0.1:8766"

# 启动后端服务（如果未运行）
# 后端服务绑定 127.0.0.1:8766，使用开发数据库
if ! curl -s -o /dev/null --max-time 1 http://127.0.0.1:8766/api/accident-simulation/health 2>/dev/null; then
    python3 run_simulation_service.py \
        --host 127.0.0.1 \
        --port 8766 \
        --database "$PROJECT_DIR/data/accident-simulation-dev.sqlite3" \
        --static "$PROJECT_DIR/dashboard/dist" &
    sleep 2
fi

# 清理 5000 端口残留进程（绝不碰 9000）
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# 启动前端 Vite dev server
cd dashboard
exec pnpm exec vite --host 0.0.0.0 --port 5000
