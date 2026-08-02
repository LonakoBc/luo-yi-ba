# 洛一把（本地试玩版）

## 启动

```powershell
cd D:\AProjects\luo-yi-ba\web
npm install
npm run dev
```

开发服务器启动时会自动读取上一级目录中的 `song/*.md`，校验并生成 `src/data/songs.generated.json`。修改歌曲 Markdown 后重启开发服务器即可刷新题库。

## 验证

```powershell
npm test
npm run build
```

- `npm test`：运行数据解析、游戏规则和页面交互测试。
- `npm run build`：生成可部署的生产文件到 `web/dist/`。

当前版本是纯前端单人模式。选题、搜索和反馈逻辑集中在 `src/services/gameService.js`，未来可在不重写页面组件的情况下替换为服务端实现。

简单模式曲目清单位于 `src/data/simpleSongTitles.js`。游戏页左上角的开发者入口由 `src/components/GamePage.jsx` 中的 `SHOW_DEVELOPER_TOOLS` 控制，将该常量改为 `false` 即可整体隐藏。
