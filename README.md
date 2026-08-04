# 洛一把

一个以洛天依传说曲为主题的网页猜歌小游戏。系统会从所选曲库中随机抽取歌曲，玩家根据 STAFF、发布时间、演唱歌姬、使用声库、演唱会／生日会次数和特殊标注等反馈逐步锁定答案，也可以依次使用歌姬与发布时间、STAFF、歌词提示。

## 曲库范围

- **自定义曲库**：按歌姬、声库、特殊标注、发布时间和演唱会／生日会经历筛选。
- **入门曲库**：50 首热门及较为出圈的精选作品。
- **洛天依传说曲**：人工审核后的 219 首完整曲库。
- **黄金时代**：收录 2015—2019 年发布的 93 首作品。

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
song/song_luotianyi/  洛天依歌曲 Markdown 数据库
presets/              Markdown 曲库预设
scripts/              数据采集与题库生成脚本
web/                  React + Vite 网页应用
bgm/                  网站背景音乐
test/                 数据脚本测试
```

## 数据与参考

- 玩法参考：[二刺猿笑传之猜猜呗](https://anime-character-guessr.netlify.app/)
- 歌曲资料来源：[VCPedia](https://vcpedia.cn/)

歌曲资料可能存在疏漏，如有错误欢迎提出 Issue 指正。
