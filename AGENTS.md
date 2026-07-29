# 应急看板与事故后果模拟

## 项目概述

80万吨烯烃全场信息化项目 - 应急管理模块。包含应急展示大屏、事故后果模拟计算、事件上报/研判/响应/终止全流程管理。

## 技术栈

- **前端**: React 19 + TypeScript + Vite 6 + ECharts 6 + Three.js + Lucide Icons
- **后端**: Python 3.12 标准库 `http.server`（无第三方依赖）
- **数据库**: SQLite3（`data/accident-simulation*.sqlite3`）
- **包管理**: pnpm（前端）、系统 Python（后端）

## 目录结构

```
/workspace/projects/
├── dashboard/              # 前端 Vite + React 应用
│   ├── src/                # 源码（App.tsx, components/, services/, data/）
│   ├── public/             # 静态资源
│   ├── package.json        # 前端依赖
│   └── vite.config.mjs     # Vite 配置
├── simulation_service/     # Python 后端计算服务
│   ├── server.py           # HTTP 服务主入口（端口 8765/8766）
│   ├── models.py           # 模拟计算模型
│   ├── api_config.py       # 第三方 API 配置
│   ├── db.py               # 数据库操作
│   ├── slab.py             # SLAB 重气计算集成
│   └── tests/              # 单元测试
├── data/                   # SQLite 数据库文件
├── docs/                   # 文档（事故模拟计算说明）
├── packaging/              # 平台打包脚本（PyInstaller）
└── run_simulation_service.py  # 后端启动入口
```

## 关键入口 / 核心模块

- **前端入口**: `dashboard/src/main.tsx`
- **后端入口**: `run_simulation_service.py` → `simulation_service/server.py:main()`
- **页面路由**:
  - `/` - 应急展示大屏
  - `/apiconfig` - 第三方 API 配置
  - `/report` - H5 事件上报
  - `/events` - Web 事件管理
  - `/config` - 应急看板地图配置（图层点位、逃生路线）
- **数据库**: `data/accident-simulation-dev.sqlite3`（开发）、`data/accident-simulation.sqlite3`（生产）

## 运行与预览

- 前端开发: `cd dashboard && pnpm dev`（Vite dev server，端口 5173）
- 后端服务: `python run_simulation_service.py`（HTTP 服务，端口 8766 开发 / 8765 生产）
- 前端通过 `VITE_SIMULATION_API_BASE_URL` 环境变量连接后端 API
- 预览时前端通过 Vite proxy 或直接指向后端端口

### Coze 预览配置

- 项目类型: Web 预览型项目
- 预览入口: `scripts/coze-preview-build.sh` + `scripts/coze-preview-run.sh`
- 预览端口: 5000（前端 Vite dev server）
- 后端服务: 预览时自动启动在 127.0.0.1:8766
- 根 `.coze` 与子项目 `dashboard/.coze` 的 `project_type` 和 `preview_enable` 保持一致

### Coze 部署配置

- 部署类型: service / web
- 构建脚本: `scripts/coze-deploy-build.sh`（构建前端静态文件）
- 运行脚本: `scripts/coze-deploy-run.sh`（启动后端服务，端口 5000）
- 运行时: nodejs-24, python-3.12
- 后端服务同时提供 API 和前端静态文件

## 用户偏好与长期约束

- 前端使用 pnpm，禁止 npm/yarn
- Python 后端仅使用标准库，不引入第三方依赖（打包用 PyInstaller 除外）
- SLAB 二进制需由部署方显式传入，未传入时重气计算明确失败，不回退高斯模型
- 后端只绑定回环地址（127.0.0.1）
- 事件状态: pending → non_emergency/responding → terminated；同一时刻只允许一条"响应中"事件

## 常见问题和预防

- `.npmrc` 中缓存路径指向 macOS 本地，已在 pnpm 安装时忽略
- 前端 `dashboard/AGENTS.md` 包含原型设计指引，修改 UI 前应先阅读
- 数据库文件 `.sqlite3-shm` 和 `.sqlite3-wal` 已在 `.gitignore` 中排除
