# 阿里云多人联机服务

该目录提供与现有前端协议 v2 兼容的 Node.js 房间服务。房间状态由单进程串行处理并以 JSON 原子写入磁盘，支持创建、加入、WebSocket 状态广播、断线恢复、房主转移、三段提示、轮间推进和最终排名。

## 本地运行

```bash
npm install
npm test
npm start
```

默认监听 `127.0.0.1:3000`。可通过 `HOST`、`PORT`、`DATA_DIRECTORY` 和 `FRONTEND_ORIGIN` 调整监听地址、房间数据目录与允许的前端来源；多个正式来源用逗号分隔。

## 阿里云部署

`deploy/install.sh` 会把服务安装到 `/opt/luo-yi-ba-multiplayer`，注册受限的 systemd 服务，并用 Nginx 反向代理 HTTP 与 WebSocket。发布压缩包需要保留仓库目录结构，并包含：

- `server/package*.json`、`server/src`、`server/deploy`
- `web/src/data/songs.generated.json`、`presets.generated.json`
- `web/src/services/gameService.js`、`libraryService.js`、`multiplayerRules.js`

部署后可执行以下完整公网验收：

```bash
node server/scripts/check-room-flow.mjs http://8.217.219.36
```

正式 Pages 环境只能连接 HTTPS/WSS 地址。在为服务器域名或 IP 配置受信任证书之前，不要把 `VITE_MULTIPLAYER_API_URL` 从当前 Worker 切换到该服务。
