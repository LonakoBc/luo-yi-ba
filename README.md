# 洛一把

一个收录洛天依、乐正绫、言和、乐正龙牙、徵羽摩柯、墨清弦、心华、星尘、海伊、苍穹、赤羽、诗岸、牧心与永夜Minus歌曲的网页音乐小游戏，目前包含“曲目猜猜看”“闪耀的 Producer”“曲名填字”“谁是老资历／小资历？”“歌曲大排序”“听歌识曲”、多人联机、曲目喜好表和数据库。十四个歌姬曲库合并去重后共有 519 首作品。

## 在线游玩

点击进入 Pages 网页版：[https://luo-yi-ba.pages.dev/](https://luo-yi-ba.pages.dev/)

Bilibili Toy 版：[https://www.bilibili.com/toy/luo-yi-ba/index.html](https://www.bilibili.com/toy/luo-yi-ba/index.html)

- **曲目猜猜看**：根据 STAFF、发布时间、演唱歌姬、声库等反馈逐步锁定答案。
- **闪耀的 Producer**：在 44 位名 P 或 104 位完整创作者范围中，根据初投稿、作品数量和代表曲反馈寻找答案。
- **数据库**：浏览 519 首全曲库、各歌姬曲库及 104 位 P 主资料。
- **曲名填字**：从全曲库、禾念系或五维介质系选择范围，将六首纯汉字曲名横纵交叉排列并逐格完成。
- **谁是老资历？**：比较两首歌曲的发布时间，随着得分提高逐步挑战更接近的年月。
- **歌曲大排序**：先用完整预设或自定义条件确定曲库，再将 5 首或 10 首歌曲按发布时间排序，或把歌曲放回正确年份。
- **多人联机**：创建 2–4 人房间，游玩猜曲、老资历、歌曲排序、曲名填字、猜 P 主和听歌识曲，也可以自由组合成多阶段派对赛程。
- **曲目喜好表**：根据本地数据库快速填写喜好表，生成结果并分享给群友。

## 曲库范围

- **自定义曲库**：按歌姬、声库、特殊标注、发布时间和演唱会／生日会经历筛选。
- **挑战全曲库！**：一次挑战当前收录的全部 519 首经典曲目。
- **洛天依入门曲库**：50 首热门及较为出圈的洛天依精选作品。
- **洛天依经典曲目**：当前人工审核后的洛天依曲库。
- **乐正绫经典曲目**：当前人工审核后的 74 首乐正绫曲库。
- **言和经典曲目**：当前人工审核后的 70 首言和曲库。
- **禾念系**：仅包含禾念系歌姬演唱的作品。
- **五维介质系**：仅包含五维介质系歌姬演唱的作品。
- **忘川风华录**：收录 STAFF 中 UP 主为忘川风华录的 47 首作品。
- **黄金时代**：收录全部歌姬在 2015—2019 年发布的 193 首不同作品。

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

Bilibili Toy 使用独立构建，不影响 Pages 版本：

```bash
cd web
npm run build:toy
```

可上传目录为仓库根目录的 `toy-dist`。Toy 版本使用 Hash 路由与相对资源路径，并将 BGM 精简为 01、02、03、04、05 五首以控制包体。

## 多人联机部署

正式多人服务运行在阿里云 Node.js 服务端，支持猜曲、老资历、歌曲排序、曲名填字、猜 P 主、听歌识曲和派对赛程。`worker/` 中的 Cloudflare Worker + Durable Object 仅保留为猜曲回退服务：

```powershell
cd worker
npm install
npx wrangler deploy --var FRONTEND_ORIGIN:https://luo-yi-ba.pages.dev
```

复制 `web/.env.example` 为本地环境文件，将 `VITE_MULTIPLAYER_API_URL` 指向要测试的多人服务。生产环境由 `web/.env.production` 指向阿里云；Cloudflare Worker 暂时保留为回退服务。

## 项目结构

```text
singers/              歌姬采集与发布配置
database/singers/     人工审核后的歌姬 JSON 数据源
producers/            P 主人工资料表（P 主玩法唯一数据源）
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

全局播放器自动载入 `bgm/` 中按文件名排序的 12 首音乐；首次进入随机播放，支持暂停、调节音量、切换下一首和主动选择曲目。

## 数据与参考

- 玩法参考：[二刺猿笑传之猜猜呗](https://anime-character-guessr.netlify.app/)
- 歌曲资料来源：[VCPedia](https://vcpedia.cn/)

歌曲资料可能存在疏漏，如有错误欢迎提出 Issue 指正。
