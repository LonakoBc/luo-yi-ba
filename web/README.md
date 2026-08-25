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

## Bilibili Toy 构建

Toy 使用独立构建目标，不需要复制项目，也不会改变 Cloudflare Pages 的构建结果：

```powershell
cd D:\AProjects\luo-yi-ba\web
npm run build:toy
```

构建完成后直接上传仓库根目录的 `toy-dist/` 文件夹。该构建使用 `#/xxx` Hash 路由、相对静态资源路径并自动注入 Toy JS SDK，只包含 01《勾指起誓》、04《一花依世界》和 05《世末歌者》三首 BGM。构建末尾会检查 `index.html`、Toy 文件后缀白名单、根路径引用和 20MB 包体目标。

多人联机仍连接阿里云服务；发布 Toy 前需要确保线上服务的 `FRONTEND_ORIGIN` 包含 `https://www.bilibili.com`。

当前版本为纯前端单人模式。选题、搜索和反馈逻辑位于 `src/services/gameService.js`，曲库筛选逻辑位于 `src/services/libraryService.js`。数据库提供十四位歌姬入口及按 VCPedia 页面去重的全曲库总览。

九个预设位于上级目录的 `presets/*.md`。当前全局题库包含 494 首不同作品，十四个歌姬数据库合计 641 条记录；共享歌曲按 VCPedia 页面全局去重。开发者入口由 `import.meta.env.DEV` 控制：运行开发服务器时显示，生产构建中自动隐藏。

全局 BGM 播放器自动载入 `bgm/` 中的 MP3，当前共 12 首；首次载入随机选曲，播放结束或点击“下一首”时按文件名顺序循环，也可从播放列表主动选曲，并在页面路由变化时保持挂载。
