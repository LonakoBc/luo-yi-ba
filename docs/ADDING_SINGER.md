# 新增歌姬工作流

项目使用 `singers/catalog.json` 统一维护歌姬采集与发布配置。新歌姬在人工审核完成前应保持 `published: false`，这样可以运行采集和生成审核资料，但不会进入网站题库。

## 1. 配置歌姬

每位歌姬需要配置 ID、名称、简称、主题色、VCPedia 条目、年度模板、歌曲起止年份、生日、官方关键词、审核 JSON 和 Markdown 目录。

当前已发布的 `yuezhengling` 与 `yanhe` 配置可作为新增歌姬时的参考：

- 年度模板：`Template:乐正绫/20XX`
- 年份：2015–2026
- 生日：4 月 12 日
- 允许声库：VOCALOID、ACE Studio、X Studio、Synthesizer V
- 采集输出：`outputs/vcpedia-crawl/yuezhengling/`
- 请求缓存：`.cache/vcpedia/yuezhengling/`
- 正式数据：`database/singers/yuezhengling.json`（51 首）
- Markdown：`song/song_yuezhengling/`

言和已完成审核并以 `published: true` 正式接入网站：

- 资料页：`https://vcpedia.cn/%E8%A8%80%E5%92%8C`
- 年度模板：`Template:言和/20XX`
- 年份：2013–2026
- 生日：7 月 11 日
- 采集输出：`outputs/vcpedia-crawl/yanhe/`
- 请求缓存：`.cache/vcpedia/yanhe/`
- 正式数据：`database/singers/yanhe.json`（51 首）
- Markdown：`song/song_yanhe/`

本轮新增的乐正龙牙与墨清弦仍保持 `published: false`；徵羽摩柯已完成审核并正式发布：

- `longya`：乐正龙牙，9 首候选，审核表 `outputs/vcpedia-crawl/longya/longya-legend-songs-review.xlsx`
- `zhiyu-moke`：徵羽摩柯，7 首，审核表 `outputs/vcpedia-crawl/zhiyu-moke/zhiyu-moke-legend-songs-review.xlsx`，正式数据 `database/singers/zhiyu-moke.json`
- `moqingxian`：墨清弦，2 首候选，审核表 `outputs/vcpedia-crawl/moqingxian/moqingxian-legend-songs-review.xlsx`

## 2. 采集候选

```powershell
npm run crawl -- --singer yuezhengling
```

也可以使用快捷命令：

```powershell
npm run crawl:yuezhengling
```

言和使用：

```powershell
npm run crawl:yanhe
```

正式请求前可以只检查配置和年度页面列表，不访问网络：

```powershell
npm run crawl:yuezhengling -- --dry-run
```

言和采集前建议先运行：

```powershell
npm run crawl:yanhe -- --dry-run
```

乐正龙牙、徵羽摩柯和墨清弦使用相同流程；本轮为小规模审核采集，使用 2 秒请求间隔：

```powershell
npm run crawl:longya -- --interval=2
npm run crawl:zhiyu-moke -- --interval=2
npm run crawl:moqingxian -- --interval=2
```

VCPedia 请求间隔保持至少 30 秒，缓存命中不会再次请求。使用 `--refresh` 会忽略缓存重新请求。

爬虫只读取年度模板中的“原创曲 → 神话曲／传说曲”。原版使用范围外声库或与范围外声库混用的歌曲会写入报告的“非目标声库排除”，不会进入规范化结果。

## 3. 人工审核与发布数据

1. 根据 `outputs/vcpedia-crawl/<id>/songs.normalized.json` 制作 Excel 审核表。
2. 人工补齐歌词、Bilibili 链接及待核验字段。
3. 将审核结果导出为 `database/singers/<id>.json`，该 JSON 是歌曲事实的唯一人工维护来源。
4. 运行下方命令生成该歌姬的 Markdown。
5. 在 `database/catalog.json` 登记数据文件和审核后的歌曲数量。
6. 最后将 `singers/catalog.json` 中该歌姬的 `published` 改为 `true`。

不要同时人工修改 JSON 和 Markdown。Markdown 应由审核 JSON 生成：

```powershell
npm run rebuild:songs -- --singer yuezhengling
```

## 4. 构建网站

前端构建会自动读取所有 `published: true` 的歌姬 Markdown：

- 以规范化 VCPedia 页面作为全局歌曲 ID。
- 同一合唱曲出现在多个歌姬曲库时自动合并。
- 若共享歌曲的事实字段不一致，构建会失败并列出冲突字段。
- 曲库筛选先按主要歌姬曲库取并集，再应用“必须包含的演唱歌姬”等条件。

```powershell
cd web
npm test
npm run build
```

发布前还应为歌姬增加专属预设；现有 Markdown 预设在构建后保存规范歌曲 ID，遇到不同作品同名时会停止构建，避免选错歌曲。共享歌曲必须先统一事实字段；正式构建会按 VCPedia 页面合并，并同时记录其所属的多个歌姬曲库。
