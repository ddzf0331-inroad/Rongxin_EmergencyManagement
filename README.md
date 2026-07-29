# 应急看板与事故后果模拟

## macOS 一键调试

在项目根目录双击 `一键启动调试.command`。程序会使用独立的调试数据库，启动本地计算服务和 Vite 前端热更新，并自动打开浏览器。完成调试后，在启动窗口按 `Control+C` 同时停止两个服务。

调试地址为 `http://127.0.0.1:5173`，计算接口使用 `http://127.0.0.1:8766`，不会占用离线包默认的 `8765` 端口。

事件功能入口：

- 应急展示大屏：`http://127.0.0.1:5173/`
- 第三方 API 配置：`http://127.0.0.1:5173/apiconfig`
- H5 事件上报：`http://127.0.0.1:5173/report`
- Web 事件管理：`http://127.0.0.1:5173/events`

事件上报、研判、响应和终止状态统一保存在当前运行数据库的
`emergency_incidents` 表中。大屏每 3 秒检查待研判事件；同一时刻只允许
一条事件处于“响应中”状态。

## 本地开发

```bash
cd dashboard && npm run build
cd .. && python run_simulation_service.py
```

访问 `http://127.0.0.1:8765`。计算服务只允许绑定回环地址，化学品、
计算输入、模型路由、结果和错误均保存到 `data/accident-simulation.sqlite3`。

## 平台打包

在 Windows、Linux 和 macOS 上分别运行：

```bash
python packaging/package_current_platform.py --slab-binary /path/to/reviewed/slab
```

脚本会生成当前平台的独立目录包、启动脚本、数据库目录和健康检查。
SLAB 上游许可声明存在商用分发限制，因此必须由部署方完成许可复核后
显式传入二进制；未传入时重气计算会明确失败，不会回退高斯模型。

## 验证

```bash
python -m unittest discover -s simulation_service/tests -v
cd dashboard && npm run build
```
