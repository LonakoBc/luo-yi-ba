import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateSlug,
  missingFields,
  parseCandidates,
  parseSongPage,
  renderSongMarkdown,
  slugifyCandidate,
  slugifyTitle,
} from '../scripts/lib.mjs';

const templateFixture = `
<table><tbody><tr><th class="navbox-title">洛天依 2015年歌曲</th></tr><tr><td>
  <table><tbody><tr><th class="navbox-title">原创曲</th></tr>
    <tr><td class="navbox-group">神话曲</td><td><a href="/普通DISCO">普通DISCO</a></td></tr>
    <tr><td class="navbox-group">传说曲</td><td><a href="/霜雪千年">霜雪千年</a></td></tr>
    <tr><td class="navbox-group">殿堂曲</td><td><a href="/不应收录">不应收录</a></td></tr>
  </tbody></table>
  <table><tbody><tr><th class="navbox-title">非原创曲</th></tr>
    <tr><td class="navbox-group">传说曲</td><td><a href="/高三税">高三税</a></td></tr>
  </tbody></table>
</td></tr></tbody></table>`;

test('只解析原创神话曲和传说曲', () => {
  const songs = parseCandidates(templateFixture);
  assert.deepEqual(songs.map(({ title, year, tier }) => ({ title, year, tier })), [
    { title: '普通DISCO', year: 2015, tier: '神话曲' },
    { title: '霜雪千年', year: 2015, tier: '传说曲' },
  ]);
});

test('同一详情页在多个年份出现时保留最早原版年份', () => {
  const html = `${templateFixture}<table><tbody><tr><th class="navbox-title">洛天依 2024年歌曲</th></tr><tr><td>
    <table><tbody><tr><th class="navbox-title">原创曲</th></tr>
    <tr><td class="navbox-group">传说曲</td><td><a href="/霜雪千年#重制版">霜雪千年</a></td></tr>
    </tbody></table></td></tr></tbody></table>`;
  const songs = parseCandidates(html);
  assert.equal(songs.filter((song) => song.title === '霜雪千年').length, 1);
  assert.equal(songs.find((song) => song.title === '霜雪千年').year, 2015);
});

test('详情页解析优先保留神话曲并识别合唱和声库', () => {
  const html = `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲","VOCALOID中文神话曲"]}</script>
  <div id="mw-content-text"><div class="mw-parser-output"><p>本曲曾于某演唱会演出。</p>
  <table><tr><td><b>普通的</b>作曲</td><td>ilem</td></tr>
  <tr><td>演唱</td><td>洛天依、言和<sub>（VC版）</sub><br>三无</td></tr></table></div></div>`;
  const song = parseSongPage(html, { title: '普通DISCO', year: 2015, tier: '神话曲' });
  assert.equal(song.staff, 'ilem（作曲）');
  assert.equal(song.voicebank, 'VOCALOID');
  assert.equal(song.performance, '合唱');
  assert.equal(song.special, '神话曲');
});

test('仅明确的官方生贺描述会标记生贺曲', () => {
  const page = (text) => `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲"]}</script>
    <div id="mw-content-text"><div class="mw-parser-output"><p>${text}</p>
    <table><tr><td>作曲</td><td>A</td></tr><tr><td>作词</td><td>B</td></tr>
    <tr><td>演唱</td><td>洛天依</td></tr></table></div></div>`;
  const candidate = { title: '测试', year: 2020, tier: '传说曲' };
  assert.equal(parseSongPage(page('本曲是Vsinger官方发布的洛天依生日纪念曲。'), candidate).special, '生贺曲');
  assert.equal(parseSongPage(page('本曲是某位同人UP主制作的洛天依生贺曲。'), candidate).special, '无');
});

test('STAFF 按 UP主优先并合并同一人的多个职能', () => {
  const html = `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲"]}</script>
    <div id="mw-content-text"><div class="mw-parser-output"><table>
    <tr><td>UP主</td><td>JUSF周存</td></tr><tr><td>作曲</td><td>Sya<br>JUSF周存</td></tr>
    <tr><td>填词</td><td>A<br>JUSF周存<br>B（中文版）</td></tr><tr><td>编曲</td><td>Sya</td></tr>
    <tr><td>演唱</td><td>洛天依</td></tr></table></div></div>`;
  const song = parseSongPage(html, { title: '测试', year: 2020, tier: '传说曲' });
  assert.equal(song.staff, 'JUSF周存（UP主、作曲、作词）；Sya（作曲、编曲）；A（作词）；B（中文版）（作词）');
});

test('作编曲映射为作曲和编曲并排除导航表及长文本污染', () => {
  const html = `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲"]}</script>
    <div id="mw-content-text"><div class="mw-parser-output"><table>
    <tr><td>UP主</td><td>A</td></tr><tr><td>作编曲</td><td>A</td></tr>
    <tr><td>作词</td><td>${'歌词'.repeat(150)}</td></tr><tr><td>演唱</td><td>洛天依</td></tr></table>
    <table class="navbox"><tr><td>作词</td><td>不应收录</td></tr></table></div></div>`;
  const song = parseSongPage(html, { title: '测试', year: 2020, tier: '传说曲' });
  assert.equal(song.staff, 'A（UP主、作曲、编曲）');
});

test('只保留原版 STAFF 并忽略后续二创信息表', () => {
  const html = `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲"]}</script>
    <div id="mw-content-text"><div class="mw-parser-output">
    <table><tr><td>UP主</td><td>A</td></tr><tr><td>作曲</td><td>A</td></tr>
    <tr><td>编曲</td><td>A（原版）<br>二创作者（重制版）</td></tr><tr><td>演唱</td><td>洛天依</td></tr></table>
    <table><tr><td>作曲</td><td>翻唱作者</td></tr><tr><td>演唱</td><td>其他歌手</td></tr></table>
    </div></div>`;
  const song = parseSongPage(html, { title: '测试', year: 2020, tier: '传说曲' });
  assert.equal(song.staff, 'A（UP主、作曲、编曲）');
  assert.equal(song.performance, '独唱');
});

test('简介优先确定 ACE 声库并抽取歌词、生日会和原投稿链接', () => {
  const html = `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲","ACE传说曲"]}</script>
    <div id="mw-content-text"><div class="mw-parser-output">
    <div class="mw-heading"><h2>简介</h2></div>
    <p>《歌》是张卡斯投稿的ACE中文原创歌曲，由洛天依演唱。</p>
    <p>本曲是洛天依生日会演唱曲目之一。</p>
    <table><tr><td>UP主</td><td>张卡斯</td></tr><tr><td>演唱</td><td>洛天依</td></tr></table>
    <a href="https://www.bilibili.com/video/BV1gMkWBWEzy">bilibili</a>
    <div class="mw-heading"><h2>歌词</h2></div>
    <div class="poem">嘿！在吗　呃…我有点话想对你说\n永远的诺言　童话扉页的诗篇\n流星穿过银河　留下的祈愿\n永远的诺言　童话扉页的诗篇</div>
    </div></div>`;
  const song = parseSongPage(html, { title: '歌', year: 2026, tier: '传说曲' });
  assert.equal(song.voicebank, 'ACE');
  assert.equal(song.lyric, '永远的诺言 童话扉页的诗篇');
  assert.equal(song.special, '生日会曲目');
  assert.equal(song.bilibili, 'https://www.bilibili.com/video/BV1gMkWBWEzy');
});

test('演唱者字段出现洛天依以外歌手时标记为合唱', () => {
  const html = `<script>RLCONF={"wgCategories":["使用VOCALOID的歌曲"]}</script>
    <div id="mw-content-text"><div class="mw-parser-output"><table>
    <tr><td>UP主</td><td>A</td></tr><tr><td>演唱者</td><td>洛天依、乐正绫</td></tr>
    </table></div></div>`;
  const song = parseSongPage(html, { title: '测试', year: 2020, tier: '传说曲' });
  assert.equal(song.performance, '合唱');
});

test('拼音文件名和冲突后缀稳定', () => {
  assert.equal(slugifyTitle('霜雪千年'), 'shuang-xue-qian-nian');
  assert.equal(slugifyTitle('普通DISCO 2.0'), 'pu-tong-disco-2-0');
  const used = new Set();
  assert.equal(allocateSlug('tong-ming', used), 'tong-ming');
  assert.equal(allocateSlug('tong-ming', used), 'tong-ming-2');
  assert.equal(slugifyCandidate({ title: 'オーダーメイド', url: 'https://mzh.moegirl.org.cn/%E5%AE%9A%E5%88%B6%E4%B9%8B%E7%89%A9' }), 'ding-zhi-zhi-wu');
});

test('Markdown 恰好八行且缺失字段进入核验列表', () => {
  const song = {
    title: '测试曲', staff: '待核验', voicebank: 'VOCALOID',
    year: 2020, performance: '独唱', lyric: '待核验', special: '无', bilibili: '待核验',
  };
  const markdown = renderSongMarkdown(song);
  assert.equal(markdown.split('\n').length, 8);
  assert.deepEqual(missingFields(song), ['STAFF', '歌词', '哔哩哔哩地址']);
});
