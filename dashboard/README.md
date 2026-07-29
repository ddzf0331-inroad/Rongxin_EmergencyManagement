# 应急管理综合展示看板

本项目实现设计文档 4.1 综合展示大屏：三列信息面板、2.5D 厂区地图、图层控制、点位详情、实时视频弹窗、报警/预案/物资/演练/值班数据展示。

## 运行

```bash
npm install
npm run dev -- --port 5173
```

本地地址：`http://127.0.0.1:5173/`

配置入口：`http://127.0.0.1:5173/config`

第三方 API 配置：`http://127.0.0.1:5173/apiconfig`

H5 事件上报：`http://127.0.0.1:5173/report`

Web 事件管理：`http://127.0.0.1:5173/events`

## 图层配置

`/config` 用于在同一张厂区地图上手动标点和绘制逃生路线。支持摄像头、应急物资、应急预案、人员坐标、重大危险源、报警信息、值班信息、应急演练等点位；逃生路线通过点击折线节点绘制，可设置不同颜色。

配置保存后会写入浏览器本地存储，key 为 `emergency-dashboard-map-config-v1`。展示平台 `/` 会优先读取这份配置；没有本地配置时再使用接口或 mock 数据。摄像头点位保存 `streamUrl` 后，展示页点击该摄像头会复用现有实时视频弹窗。

## API 对接

默认未配置后端时使用 `src/data/mockDashboard.ts`。配置 `.env` 后会优先请求真实接口，失败自动回落 mock：

```bash
VITE_API_BASE_URL=https://your-api-host
```

预留接口：

- `GET /api/emergency-dashboard/snapshot`
- `GET /api/emergency-dashboard/map-config`
- `PUT /api/emergency-dashboard/map-config`
- `GET /api/emergency-dashboard/map-points`
- `GET /api/emergency-dashboard/escape-routes`
- `GET /api/emergency-dashboard/alerts`
- `GET /api/emergency-dashboard/duty-staff?keyword=`
- `GET /api/emergency-dashboard/cameras/:id/stream`
- `POST /api/emergency/incidents`
- `GET /api/emergency/incidents?keyword=&status=&type=`
- `GET /api/emergency/incidents/pending`
- `GET /api/emergency/incidents/active`
- `POST /api/emergency/incidents/:id/non-emergency`
- `POST /api/emergency/incidents/:id/respond`
- `POST /api/emergency/incidents/:id/terminate`

核心类型在 `src/types.ts`，地图图层键包括 `camera`、`material`、`plan`、`personnel`、`hazard`、`drill`、`alarm`、`duty`、`escapeRoute`。

## 第三方明细数据

`/apiconfig` 将第三方环境地址和 7 类固定数据源配置保存到本地服务的 SQLite。每类数据源支持 GET 路径、默认查询参数、分页参数、响应点路径、明细字段点路径和详情页面跳转配置。服务端负责请求代理、同源详情地址拼接和最近成功数据缓存；前端不会直接访问第三方域名。
