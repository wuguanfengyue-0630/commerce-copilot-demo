# Commerce Copilot

Commerce Copilot 是一个本地可运行的电商客服 Copilot 演示。首个交付版本只验证确定性客服流程，不连接真实平台或真实模型。

## 本地运行

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
pnpm test:e2e
```

`pnpm dev` 会同时启动 API（`http://127.0.0.1:4000`）和 Web（`http://127.0.0.1:3000`）。首次访问后按六步设置向导完成演示初始化。

## 演示边界

- 不需要平台 OAuth、模型 API Key 或其他外部 secrets。
- 飞鸽消息权限尚未接入，因此只能复制建议并由人工发送，不能自动发送飞鸽消息。
- 所有退款都是内存中的模拟结果，不能执行真实退款或其他真实金融写操作。
- 真实模型质量、生产部署、平台授权和持久化审计属于后续计划。

## 发布检查

- `pnpm verify`：格式、lint、类型、单元/集成测试和构建。
- `pnpm test:e2e`：Chromium 完整设置、纵向客服闭环、管理页面和 axe 无障碍检查。
