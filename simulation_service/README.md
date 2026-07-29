# 本地事故后果计算服务

服务只允许绑定回环地址，使用 Python 标准库 HTTP 服务和 SQLite，不访问网络。

```bash
python run_simulation_service.py
```

默认地址为 `http://127.0.0.1:8765`，健康检查为
`/api/accident-simulation/health`。构建后的 `dashboard/dist` 由同一进程托管。

重气计算必须安装经许可复核的 EPA SLAB 平台二进制；缺失或执行失败时该次
运行会写入 SQLite 并明确失败，不会退回高斯模型。SLAB 授权提示见
`vendor/slab/NOTICE.md`。

