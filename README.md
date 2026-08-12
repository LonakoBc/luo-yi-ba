# 洛一把

一个收录洛天依、乐正绫、言和、乐正龙牙、徵羽摩柯、墨清弦、心华、星尘、海伊、苍穹、赤羽、诗岸、牧心与永夜Minus歌曲的网页音乐小游戏，目前包含“曲目猜猜看”“曲名填字”“谁是老资历／小资历？”“歌曲大排序”和歌曲数据库。十四个歌姬曲库合并去重后共有 494 首作品。

## 在线游玩

点击进入：[https://luo-yi-ba.pages.dev/](https://luo-yi-ba.pages.dev/)

- **曲目猜猜看**：根据 STAFF、发布时间、演唱歌姬、声库等反馈逐步锁定答案。
- **曲名填字**：从全曲库、禾念系或五维介质系选择范围，将六首纯汉字曲名横纵交叉排列并逐格完成。
- **谁是老资历？**：比较两首歌曲的发布时间，随着得分提高逐步挑战更接近的年月。
- **歌曲大排序**：先用完整预设或自定义条件确定曲库，再将 5 首或 10 首歌曲按发布时间排序，或把歌曲放回正确年份。

## 曲库范围

- **自定义曲库**：按歌姬、声库、特殊标注、发布时间和演唱会／生日会经历筛选。
- **挑战全曲库！**：一次挑战当前收录的全部 494 首经典曲目。
- **洛天依入门曲库**：50 首热门及较为出圈的洛天依精选作品。
- **洛天依经典曲目**：当前人工审核后的 301 首洛天依曲库。
- **乐正绫经典曲目**：当前人工审核后的 74 首乐正绫曲库。
- **言和经典曲目**：当前人工审核后的 70 首言和曲库。
- **禾念系**：仅包含禾念系六位歌姬演唱的 378 首作品。
- **五维介质系**：仅包含五维介质系七位歌姬演唱的 95 首作品。
- **忘川风华录**：收录 STAFF 中 UP 主为忘川风华录的 47 首作品。
- **黄金时代**：收录全部歌姬在 2015—2019 年发布的 192 首不同作品。

## 本地运行

请先安装 Node.js 22，然后执行：

```bash
cd web
npm install
npm run dev
```

生产构建：

```bash
cd web
npm run build
```

线上版本通过 Cloudflare Pages 部署；构建目录为 `web/dist`，SPA 子路由由 `web/public/_redirects` 处理。

## 多人联机部署

多人曲目猜猜看使用 `worker/` 中的 Cloudflare Worker + Durable Object。首次部署前安装 Worker 依赖，并设置允许访问的 Pages 域名：

```powershell
cd worker
npm install
npx wrangler deploy --var FRONTEND_ORIGIN:https://luo-yi-ba.pages.dev
```

复制 `web/.env.example` 为本地环境文件，将 `VITE_MULTIPLAYER_API_URL` 指向部署后的 Worker 地址。开发时分别运行 `worker` 的 `npm run dev` 与 `web` 的 `npm run dev`。

## 项目结构

```text
singers/              歌姬采集与发布配置
database/singers/     人工审核后的歌姬 JSON 数据源
song/song_<id>/       由审核 JSON 生成的歌曲 Markdown
presets/              Markdown 曲库预设
scripts/              数据采集与题库生成脚本
web/                  React + Vite 网页应用
bgm/                  网站背景音乐
test/                 数据脚本测试
```

## 新增歌姬

歌姬采集、审核、Markdown 生成和发布流程见 [新增歌姬工作流](docs/ADDING_SINGER.md)。洛天依、乐正绫、言和与徵羽摩柯均已完成审核并接入网页。

## 背景音乐

全局播放器包含《勾指起誓》《普通DISCO》《我的悲伤是水做的》《一花依世界》和《世末歌者》五首纯音乐；首次进入随机播放，支持暂停、调节音量和切换下一首。

## 数据与参考

- 玩法参考：[二刺猿笑传之猜猜呗](https://anime-character-guessr.netlify.app/)
- 歌曲资料来源：[VCPedia](https://vcpedia.cn/)

歌曲资料可能存在疏漏，如有错误欢迎提出 Issue 指正。
