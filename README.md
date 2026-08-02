# 洛一把

一个以洛天依传说曲为主题的网页猜歌小游戏。

系统会随机选取一首歌曲。玩家每次猜测后，可以根据曲名字数、STAFF、年份、声库和演唱形式等反馈逐步锁定答案，也可以使用年份、STAFF 与歌词提示。

## 游戏模式

- **简单模式**：收录更热门、较为出圈，以及登上过演唱会或生日会的精选作品。
- **困难模式**：收录截至 2026 年 8 月 1 日整理的洛天依传说曲。

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

## 项目结构

```text
song/       歌曲 Markdown 数据库
scripts/    数据抓取与题库生成脚本
web/        React + Vite 网页应用
bgm/        网站背景音乐
test/       数据脚本测试
```

## 数据与参考

- 玩法参考：[二刺猿笑传之猜猜呗](https://anime-character-guessr.netlify.app/)
- 歌曲资料来源：[萌娘百科](https://mzh.moegirl.org.cn/Mainpage#/flow)

歌曲资料可能存在疏漏，如有错误欢迎提出 Issue 指正。
