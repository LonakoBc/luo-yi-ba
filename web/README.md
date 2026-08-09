# 洛一把前端

## 启动

```powershell
cd D:\AProjects\luo-yi-ba\web
npm install
npm run dev
```

开发和构建前会读取 `singers/catalog.json` 中所有已发布歌姬的 Markdown 目录与 `presets/*.md`，校验、合并共享歌曲后生成前端题库和预设数据。人工审核数据以 `database/singers/*.json` 为准，Markdown 通过根目录脚本生成。

## 验证

```powershell
npm test
npm run build
```

- `npm test`：运行数据解析、预设校验、游戏规则和页面交互测试。
- `npm run build`：生成可部署的生产文件到 `web/dist/`。

当前版本为纯前端单人模式。选题、搜索和反馈逻辑位于 `src/services/gameService.js`，曲库筛选逻辑位于 `src/services/libraryService.js`。

七个预设分别位于上级目录的 `presets/all.md`、`presets/intro.md`、`presets/luotianyi.md`、`presets/yuezhengling.md`、`presets/yanhe.md`、`presets/zhiyu-moke.md` 和 `presets/golden-age.md`。当前全局题库包含 250 首不同作品，数据库按歌姬分别展示洛天依 219 首、乐正绫 51 首、言和 51 首和徵羽摩柯 7 首。开发者入口由 `import.meta.env.DEV` 控制：运行开发服务器时显示，生产构建中自动隐藏。

全局 BGM 播放器维护《勾指起誓》《普通DISCO》《我的悲伤是水做的》《一花依世界》和《世末歌者》五首纯音乐，首次载入随机选曲，播放结束或点击“下一首”时按列表循环，并在页面路由变化时保持挂载。
