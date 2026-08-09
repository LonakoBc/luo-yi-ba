import test from 'node:test';
import assert from 'node:assert/strict';
import { PoliteFetcher, retryAfterMs } from '../scripts/vcpedia-fetcher.mjs';
import { dedupeCandidates, parseVcpediaSong, parseYearCandidates } from '../scripts/vcpedia-lib.mjs';
import { extractBilibiliUrl } from '../scripts/vcpedia-bilibili.mjs';

const annualFixture = `<table><tbody><tr><th class="navbox-title">洛天依 2015年歌曲</th></tr><tr><td>
<table><tbody><tr><th class="navbox-title">原创曲</th></tr>
<tr><td class="navbox-group">神话曲</td><td><a href="/普通DISCO">普通DISCO</a></td></tr>
<tr><td class="navbox-group">传说曲</td><td><a href="/霜雪千年">霜雪千年</a></td></tr>
<tr><td class="navbox-group">殿堂曲</td><td><a href="/不收录">不收录</a></td></tr></tbody></table>
<table><tbody><tr><th class="navbox-title">非原创曲</th></tr>
<tr><td class="navbox-group">传说曲</td><td><a href="/翻唱曲">翻唱曲</a></td></tr></tbody></table>
</td></tr></tbody></table>`;

test('VCPedia 年度页只解析原创神话曲和传说曲', () => {
  const rows = parseYearCandidates(annualFixture, 'https://vcpedia.cn/Template:洛天依/2015', '洛天依');
  assert.deepEqual(rows.map(({ title, tier }) => ({ title, tier })), [
    { title: '普通DISCO', tier: '神话曲' }, { title: '霜雪千年', tier: '传说曲' },
  ]);
});

test('年度页解析器可按其他歌姬名称复用', () => {
  const fixture = annualFixture.replace('洛天依 2015年歌曲', '乐正绫 2015年歌曲');
  const rows = parseYearCandidates(fixture, 'https://vcpedia.cn/Template:乐正绫/2015', '乐正绫');
  assert.equal(rows.length, 2);
});

test('年度页解析器支持言和年度模板', () => {
  const fixture = annualFixture.replace('洛天依 2015年歌曲', '言和 2013年歌曲');
  const rows = parseYearCandidates(fixture, 'https://vcpedia.cn/Template:言和/2013', '言和');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(({ templateUrl }) => templateUrl === 'https://vcpedia.cn/Template:言和/2013'));
});

test('跨年份同页只保留最早原版且保留神话等级', () => {
  const base = { title: '权御天下', url: 'https://vcpedia.cn/权御天下', sourceOrder: 1, templateUrl: 'a', pageTitle: '权御天下' };
  const rows = dedupeCandidates([
    { ...base, year: 2015, tier: '神话曲' },
    { ...base, year: 2025, tier: '传说曲', sourceOrder: 2 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].year, 2015);
  assert.equal(rows[0].tier, '神话曲');
});

test('详情源码提取原版 STAFF、投稿月份、歌姬和声库并排除二创', () => {
  const wikitext = `{{VOCALOID_Songbox|演唱=[[洛天依]]、[[言和]]|UP主=[[ilem]]|投稿时间=2015年3月21日}}
== 简介 ==
《测试曲》是ilem于2015年3月21日投稿至bilibili的VOCALOID中文原创歌曲，由洛天依与言和演唱。
== 歌词 ==
{{VOCALOID Songbox Introduction|group1=作编曲|list1=[[ilem]]|group2=作词|list2=[[ilem]]|group3=演唱|list3=[[洛天依]]、[[言和]]}}
== 二次创作 ==
{{VOCALOID Songbox Introduction|group1=作曲|list1=翻唱作者}}`;
  const song = parseVcpediaSong({ wikitext, categories: ['使用VOCALOID的歌曲', '洛天依歌曲', '言和歌曲'] }, {
    title: '测试曲', tier: '神话曲', year: 2015, templateUrl: 't', url: 'u',
  });
  assert.equal(song.staff, 'UP主：ilem；作曲：ilem；作词：ilem；编曲：ilem');
  assert.equal(song.releaseMonth, '2015-03');
  assert.equal(song.singers, '洛天依；言和');
  assert.equal(song.voicebanks, 'VOCALOID');
  assert.ok(!song.staff.includes('翻唱作者'));
});

test('星尘Infinity按星尘的 Synthesizer V 声库名称归一', () => {
  const candidate = { title: '始见千秋', year: 2022, tier: '传说曲', url: 'https://vcpedia.cn/始见千秋', templateUrl: 'https://vcpedia.cn/Template:星尘/2022' };
  const wikitext = `{{VOCALOID_Songbox|演唱=[[苍穹]]、[[星尘#Synthesizer V|星尘Infinity]]、[[赤羽]]、[[海伊]]|UP主=[[忘川风华录]]|投稿时间=2022年10月7日}}
== 简介 ==
《始见千秋》是忘川风华录投稿的Synthesizer V中文原创歌曲，由苍穹、星尘Infinity、赤羽、海伊演唱。`;
  const song = parseVcpediaSong({ wikitext, categories: ['星尘歌曲', '使用Synthesizer V的歌曲'] }, candidate, { singer: { name: '星尘' } });
  assert.equal(song.singers, '苍穹；星尘；赤羽；海伊');
  assert.equal(song.voicebanks, 'Synthesizer V');
});

test('Seattle物语 II 提取双歌姬、原版 STAFF、Bilibili 与完整歌词行', () => {
  const wikitext = `{{VOCALOID_Songbox
|演唱 = [[乐正绫]]、[[洛天依]]
|UP主 = [[Ddickky]]
|bb_id = av2585185
|投稿时间 = 2015年7月17日
}}
== 简介 ==
《'''Seattle物语 II'''》是[[Ddickky]]于2015年7月17日投稿至bilibili的VOCALOID中文原创歌曲，由[[乐正绫]]和[[洛天依]]演唱。
== 歌词 ==
{{VOCALOID Songbox Introduction
|group1 = 作编曲<br />作词<br />调校
|list1 = [[Ddickky]]
|group2 = 混音
|list2 = [[战场原妖精]]
}}
<poem>
{{交叉颜色|c1=#EE0000|c2=#66CCFF|
启程时迎着日出　抵达时伴着日暮
坐了一整天的车　你应该很累吧|
听说这家店不错　|你很高兴地对我说}}
</poem>`;
  const song = parseVcpediaSong({ wikitext, categories: ['乐正绫歌曲', '洛天依歌曲', '使用VOCALOID的歌曲'] }, {
    title: 'Seattle物语 II', tier: '传说曲', year: 2015,
    templateUrl: 'https://vcpedia.cn/Template:乐正绫/2015', url: 'https://vcpedia.cn/Seattle物语_II',
  }, { singer: { name: '乐正绫', birthday: '04-12', officialKeywords: ['乐正绫官方'] } });
  assert.equal(song.staff, 'UP主：Ddickky；作曲：Ddickky；作词：Ddickky；编曲：Ddickky');
  assert.equal(song.releaseMonth, '2015-07');
  assert.equal(song.singers, '乐正绫；洛天依');
  assert.equal(song.voicebanks, 'VOCALOID');
  assert.equal(song.bilibiliUrl, 'https://www.bilibili.com/video/av2585185/');
  assert.equal(song.lyrics, '启程时迎着日出 抵达时伴着日暮');
  assert.deepEqual(song.issues, []);
});

test('合集页候选按锚点和曲名定位对应折叠歌曲', () => {
  const wikitext = `==附录歌曲==
{{Toggle|button=<h3>其他歌曲</h3>|content={{BilibiliVideo|id=111}}}}
{{Toggle|button=<h3>妄想Reality</h3>|content=
《'''妄想Reality'''》是[[DELA]]于2017年12月27日投稿至bilibili的VOCALOID中文原创歌曲，由[[洛天依]]、[[言和]]与[[乐正绫]]演唱。
{{BilibiliVideo|id=17679245}}
<big>'''歌词'''</big>
{{VOCALOID Songbox Introduction|group1=作编曲|list1=DELA|group2=作词|list2=雨狸|group3=演唱|list3=[[洛天依]]<br/>[[言和]]<br/>[[乐正绫]]}}
<poem>
【零重祈愿】【泠重乞愿】
〔零羽、泠珞〕情感无限交织的深渊
我们看见了什么
</poem>}}
==轶事==`;
  const candidate = {
    title: '妄想Reality', tier: '传说曲', year: 2017, sectionAnchor: '附录歌曲',
    templateUrl: 'https://vcpedia.cn/Template:乐正绫/2017',
    url: 'https://vcpedia.cn/妄想症Paranoia系列',
    sourceUrl: 'https://vcpedia.cn/妄想症Paranoia系列#%E9%99%84%E5%BD%95%E6%AD%8C%E6%9B%B2',
  };
  const song = parseVcpediaSong({ wikitext, categories: ['乐正绫歌曲', '使用VOCALOID的歌曲'] }, candidate, { singer: { name: '乐正绫' } });
  assert.equal(song.staff, 'UP主：DELA；作曲：DELA；作词：雨狸；编曲：DELA');
  assert.equal(song.releaseMonth, '2017-12');
  assert.equal(song.bilibiliUrl, 'https://www.bilibili.com/video/av17679245/');
  assert.equal(song.lyrics, '情感无限交织的深渊');
  assert.equal(song.vcpediaUrl, candidate.sourceUrl);
});

test('演唱会按活动名称去重且巡演多站只计一次', () => {
  const wikitext = `{{VOCALOID_Songbox|演唱=[[洛天依]]|UP主=A|投稿时间=2024年1月1日}}
== 简介 ==
《测试曲》是A投稿的ACE中文原创歌曲，由洛天依演唱。
本曲在以下场合成为演唱曲目之一：
*2025年7月、8月举办的[[洛天依2025无限共鸣全息巡回演唱会]]北京站、成都站。
*2026年2月举办的[[洛天依2025无限共鸣全息巡回演唱会]]无锡站。
*2026年7月举办的[[洛天依十四周年生日音乐会]]。
== 歌曲 ==`;
  const song = parseVcpediaSong({ wikitext, categories: ['使用ACE Studio的歌曲', '洛天依歌曲'] }, {
    title: '测试曲', tier: '传说曲', year: 2024, templateUrl: 't', url: 'u',
  });
  assert.equal(song.concertCount, 2);
});

test('特殊标注支持官方生贺、拜年祭和企划多标签，同人生贺不标记', () => {
  const candidate = { title: '测试曲', tier: '传说曲', year: 2025, templateUrl: 't', url: 'u' };
  const official = parseVcpediaSong({ wikitext: `==简介==\n本曲是Vsinger官方发布的洛天依生日纪念曲，也是某企划曲目，并于拜年祭首发。`, categories: [] }, candidate);
  assert.equal(official.special, '生贺曲；拜年祭曲目；系列/企划曲目');
  const fan = parseVcpediaSong({ wikitext: `==简介==\n本曲是同人UP主创作的洛天依生贺曲。`, categories: [] }, candidate);
  assert.equal(fan.special, '单曲');
});

test('乐正绫官方生贺按 4 月 12 日和歌姬配置识别', () => {
  const candidate = { title: '测试曲', tier: '传说曲', year: 2025, templateUrl: 't', url: 'u' };
  const singer = { name: '乐正绫', birthday: '04-12', officialKeywords: ['乐正绫官方', 'Vsinger官方'] };
  const official = parseVcpediaSong({ wikitext: '==简介==\n本曲由乐正绫官方账号于2025年4月12日投稿，是十周年生日歌曲。', categories: [] }, candidate, { singer });
  const fan = parseVcpediaSong({ wikitext: '==简介==\n本曲是同人UP主于4月12日创作的乐正绫生贺曲。', categories: [] }, candidate, { singer });
  assert.equal(official.special, '生贺曲');
  assert.equal(fan.special, '单曲');
});

test('言和官方生贺按 7 月 11 日和歌姬配置识别', () => {
  const candidate = { title: '测试曲', tier: '传说曲', year: 2025, templateUrl: 't', url: 'u' };
  const singer = { name: '言和', birthday: '07-11', officialKeywords: ['言和官方', 'Vsinger官方'] };
  const official = parseVcpediaSong({ wikitext: '==简介==\n本曲由言和官方账号于2025年7月11日投稿，是十二周年生日歌曲。', categories: [] }, candidate, { singer });
  const fan = parseVcpediaSong({ wikitext: '==简介==\n本曲是同人UP主于7月11日创作的言和生贺曲。', categories: [] }, candidate, { singer });
  assert.equal(official.special, '生贺曲');
  assert.equal(fan.special, '单曲');
});

test('礼貌请求器在连续请求和重试前均等待最小间隔', async () => {
  let now = 0;
  const sleeps = [];
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503, statusText: 'Unavailable', headers: { get: () => null } };
    return { ok: true, json: async () => ({ ok: true }), headers: { get: () => null } };
  };
  const fetcher = new PoliteFetcher({
    cacheDir: null, minDelayMs: 30_000, maxAttempts: 2, fetchImpl,
    now: () => now,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
  });
  await fetcher.requestJson({ url: 'https://example.test', cacheKey: 'a' });
  await fetcher.requestJson({ url: 'https://example.test/2', cacheKey: 'b' });
  assert.deepEqual(sleeps, [30_000, 30_000]);
  assert.equal(retryAfterMs('60', 30_000), 60_000);
});

test('Bilibili 链接优先使用原版 Songbox，并支持仅有搬运的页面', () => {
  const original = `{{VOCALOID_Songbox
|bb_id = BV1abcdefghJ
}}
== 歌曲 ==
{{BilibiliVideo|id=BV1abcdefghJ}}
== 二次创作 ==
{{BilibiliVideo|id=BV1zzzzzzzzZ}}`;
  assert.equal(extractBilibiliUrl(original), 'https://www.bilibili.com/video/BV1abcdefghJ/');
  assert.equal(extractBilibiliUrl('== 歌曲 ==\n;搬运\n{{av|938592427}}'), 'https://www.bilibili.com/video/av938592427/');
});
