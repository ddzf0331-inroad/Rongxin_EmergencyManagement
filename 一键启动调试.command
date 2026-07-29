#!/bin/zsh

set -u

PROJECT_ROOT="${0:A:h}"
BACKEND_PORT=8766
FRONTEND_PORT=5173
BACKEND_PID=""
FRONTEND_PID=""
CLEANUP_DONE=0

pause_on_error() {
  echo
  read -r "reply?启动失败，按回车键关闭窗口..."
}

fail() {
  echo "[错误] $1"
  pause_on_error
  exit 1
}

cleanup() {
  [[ "$CLEANUP_DONE" -eq 1 ]] && return
  CLEANUP_DONE=1
  trap - EXIT INT TERM HUP
  echo
  echo "正在停止调试服务..."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo "调试服务已停止。"
}

port_is_busy() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_service() {
  local name="$1"
  local url="$2"
  local pid="$3"
  local attempt
  for attempt in {1..60}; do
    curl --fail --silent "$url" >/dev/null 2>&1 && return 0
    kill -0 "$pid" 2>/dev/null || fail "${name}进程已退出，请查看上方日志。"
    sleep 0.25
  done
  fail "等待${name}启动超时。"
}

echo "========================================"
echo "  应急看板 · 一键启动调试"
echo "========================================"
echo "项目目录：$PROJECT_ROOT"
echo

command -v python3 >/dev/null 2>&1 || fail "未找到 python3。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请先安装 Node.js。"
command -v curl >/dev/null 2>&1 || fail "未找到 curl。"
[[ -d "$PROJECT_ROOT/dashboard/node_modules" ]] || fail "前端依赖尚未安装，请先在 dashboard 目录执行 npm install。"
port_is_busy "$BACKEND_PORT" && fail "端口 $BACKEND_PORT 已被占用，请先关闭占用该端口的程序。"
port_is_busy "$FRONTEND_PORT" && fail "端口 $FRONTEND_PORT 已被占用，请先关闭已有的前端调试服务。"

trap cleanup EXIT INT TERM HUP

echo "[1/2] 启动本地计算服务：http://127.0.0.1:$BACKEND_PORT"
python3 "$PROJECT_ROOT/run_simulation_service.py" \
  --host 127.0.0.1 \
  --port "$BACKEND_PORT" \
  --database "$PROJECT_ROOT/data/accident-simulation-dev.sqlite3" \
  --static "$PROJECT_ROOT/dashboard/dist" &
BACKEND_PID=$!
wait_for_service "计算服务" "http://127.0.0.1:$BACKEND_PORT/api/accident-simulation/health" "$BACKEND_PID"

echo "[2/2] 启动前端热更新服务：http://127.0.0.1:$FRONTEND_PORT"
(
  trap - EXIT INT TERM HUP
  cd "$PROJECT_ROOT/dashboard" || exit 1
  VITE_SIMULATION_API_BASE_URL="http://127.0.0.1:$BACKEND_PORT" npm run dev -- --port "$FRONTEND_PORT" --strictPort
) &
FRONTEND_PID=$!
wait_for_service "前端服务" "http://127.0.0.1:$FRONTEND_PORT" "$FRONTEND_PID"

echo
echo "启动完成，正在打开浏览器..."
echo "应急平台：http://127.0.0.1:$FRONTEND_PORT/"
echo "第三方API配置：http://127.0.0.1:$FRONTEND_PORT/apiconfig"
echo "H5事件上报：http://127.0.0.1:$FRONTEND_PORT/report"
echo "事件管理：http://127.0.0.1:$FRONTEND_PORT/events"
echo "事故模拟：http://127.0.0.1:$FRONTEND_PORT/simulation"
echo "地图标定：http://127.0.0.1:$FRONTEND_PORT/config/calibration"
echo
echo "修改前端代码后页面会自动更新。"
echo "完成调试后，请在本窗口按 Control+C 停止全部服务。"

open "http://127.0.0.1:$FRONTEND_PORT/"
wait "$FRONTEND_PID"
