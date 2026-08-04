# 洛一把前端

## 启动

```powershell
cd D:\AProjects\luo-yi-ba\web
npm install
npm run dev
```

开发和构建前会自动读取 `song/song_luotianyi/*.md` 与 `presets/*.md`，校验后生成前端题库和预设数据。修改 Markdown 后重新启动开发服务器即可刷新数据。

## 验证

```powershell
npm test
npm run build
```

- `npm test`：运行数据解析、预设校验、游戏规则和页面交互测试。
- `npm run build`：生成可部署的生产文件到 `web/dist/`。

当前版本为纯前端单人模式。选题、搜索和反馈逻辑位于 `src/services/gameService.js`，曲库筛选逻辑位于 `src/services/libraryService.js`。

三个预设分别位于上级目录的 `presets/intro.md`、`presets/luotianyi.md` 和 `presets/golden-age.md`。开发者入口由 `import.meta.env.DEV` 控制：运行开发服务器时显示，生产构建中自动隐藏。
