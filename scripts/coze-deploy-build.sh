#!/usr/bin/env bash
set -euo pipefail

# 基于脚本位置定位项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# 如果 pnpm 可用，则构建前端；否则使用已提交的预构建产物
if command -v pnpm >/dev/null 2>&1; then
    cd dashboard
    pnpm install
    pnpm run build
else
    echo "pnpm not found, using pre-built dashboard/dist"
    if [ ! -d "$PROJECT_DIR/dashboard/dist" ]; then
        echo "ERROR: dashboard/dist not found and pnpm is unavailable"
        exit 1
    fi
fi
