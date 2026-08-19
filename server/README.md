# 阿里云多人联机服务

该目录提供前端协议 v3 对应的 Node.js 房间服务。房间状态由单进程串行处理并以 JSON 原子写入磁盘，支持多人猜曲、老资历、歌曲排序和铁人三项，以及创建、加入、WebSocket 广播、断线恢复、房主转移、轮间推进和最终排名。

## 本地运行

```bash
npm install
npm test
npm start
```

默认监听 `127.0.0.1:3000`。可通过 `HOST`、`PORT`、`DATA_DIRECTORY` 和 `FRONTEND_ORIGIN` 调整监听地址、房间数据目录与允许的前端来源；多个正式来源用逗号分隔。

## 阿里云部署

先在 Windows 工作区根目录生成完整发布包：

```powershell
powershell -ExecutionPolicy Bypass -File server/deploy/package.ps1
```

脚本会生成 `aliyun-multiplayer-release.tar.gz`，并确保发布包包含：

- `server/package*.json`、`server/src`、`server/deploy`
- `web/src/data/songs.generated.json`、`presets.generated.json`
- `web/src/services/gameService.js`、`libraryService.js`、`multiplayerRules.js`

将压缩包上传到服务器的 `/tmp/aliyun-multiplayer-release.tar.gz`，再以 root 执行：

```bash
bash /opt/luo-yi-ba-multiplayer/server/deploy/install.sh
```

`deploy/install.sh` 会安装依赖、更新受限的 systemd 服务并校验、重载 Nginx。已有 `server/data/rooms` 不在发布包中，因此更新代码不会覆盖房间持久化目录。

上线顺序必须是：先更新阿里云后端并验证协议 v3，再发布 Cloudflare Pages 前端。这样旧前端仍能连接新后端，不会出现新前端先请求尚未支持的新玩法。

后端更新后先检查能力声明：

```bash
curl -fsS https://8.217.219.36/health
curl -fsS https://8.217.219.36/api/catalog
```

返回结果应包含 `protocolVersion: 3`，以及 `guess-song`、`seniority`、`sorting`、`triathlon` 四种模式。

部署后可执行以下完整公网验收：

```bash
node server/scripts/check-room-flow.mjs http://8.217.219.36
```

生产前端固定使用 `https://8.217.219.36`，对应 WebSocket 会自动切换为 WSS。阿里云后端验收通过后再构建并发布 Pages。
