import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { UPDATE_NOTICE_STORAGE_KEY } from './components/UpdateNoticeDialog';

const songs = [
  {
    id: 'answer', title: '答案曲', staffDisplay: 'UP主：甲；作曲：甲', staffPeople: ['甲'], releaseMonth: '2020-03',
    singersDisplay: '洛天依', singerMembers: ['洛天依'], voicebanksDisplay: 'VOCALOID', voicebankMembers: ['VOCALOID'],
    concertCount: 3, special: '单曲', lyrics: '答案歌词完整的一行',
    sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }],
    bilibiliUrl: 'https://www.bilibili.com/video/av1', vcpediaUrl: 'https://vcpedia.cn/答案曲',
  },
  {
    id: 'guess', title: '猜测曲', staffDisplay: 'UP主：乙；作词：甲', staffPeople: ['乙', '甲'], releaseMonth: '2019-04',
    singersDisplay: '洛天依；言和', singerMembers: ['洛天依', '言和'], voicebanksDisplay: 'VOCALOID；ACE Studio', voicebankMembers: ['VOCALOID', 'ACE Studio'],
    concertCount: 1, special: '系列/企划曲目', lyrics: '猜测歌词完整的一行',
    sourceLibraries: [{ id: 'luotianyi', name: '洛天依' }],
    bilibiliUrl: 'https://www.bilibili.com/video/av2', vcpediaUrl: 'https://vcpedia.cn/猜测曲',
  },
];

const presets = [
  { id: 'all', name: '挑战全曲库！', description: '全部曲库', titles: songs.map(({ title }) => title) },
  { id: 'intro', name: '洛天依入门曲库', description: '精选作品', badge: { text: '洛', color: '#66CCFF' }, titles: songs.map(({ title }) => title) },
  { id: 'luotianyi', name: '洛天依经典曲目', description: '完整曲库', badge: { text: '洛', color: '#66CCFF' }, titles: songs.map(({ title }) => title) },
  { id: 'yuezhengling', name: '乐正绫经典曲目', description: '完整曲库', badge: { text: '绫', color: '#EE0000' }, titles: songs.map(({ title }) => title) },
  { id: 'yanhe', name: '言和经典曲目', description: '完整曲库', badge: { text: '言', color: '#00FFCC', textColor: '#073148' }, titles: songs.map(({ title }) => title) },
  { id: 'golden-age', name: '黄金时代', description: '黄金时期', titles: songs.map(({ title }) => title) },
];

const database = {
  catalog: [
    { id: 'all', name: '全曲库', shortName: '全', themeColor: '#805AD5', songCount: 2 },
    { id: 'luotianyi', name: '洛天依', shortName: '依', themeColor: '#66CCFF', songCount: 2 },
  ],
  libraries: {
    all: songs.map((song, index) => ({
      index: index + 1, title: song.title, staff: song.staffDisplay, releaseMonth: song.releaseMonth,
      singers: song.singersDisplay, singerMembers: song.singerMembers, voicebanks: song.voicebanksDisplay,
      voicebankMembers: song.voicebankMembers, concertCount: song.concertCount, special: song.special,
      lyrics: song.lyrics, bilibiliUrl: song.bilibiliUrl, vcpediaUrl: song.vcpediaUrl,
    })),
    luotianyi: songs.map((song, index) => ({
      index: index + 1,
      title: song.title,
      staff: song.staffDisplay,
      releaseMonth: song.releaseMonth,
      singers: song.singersDisplay,
      singerMembers: song.singerMembers,
      voicebanks: song.voicebanksDisplay,
      voicebankMembers: song.voicebankMembers,
      concertCount: song.concertCount,
      special: song.special,
      lyrics: song.lyrics,
      bilibiliUrl: song.bilibiliUrl,
      vcpediaUrl: song.vcpediaUrl,
    })),
  },
};

function submitTitle(title) {
  const input = screen.getByLabelText('输入你猜测的歌曲');
  fireEvent.change(input, { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: '提交猜测' }));
}

function renderGame(customSongs = songs) {
  return render(<App songs={customSongs} presets={presets.map((preset) => ({ ...preset, titles: customSongs.map(({ title }) => title) }))} random={() => 0} initialPage="game" initialMode="hard" />);
}

function openHomeQuickEntry() {
  fireEvent.click(screen.getByRole('button', { name: /快速入口/u }));
}

async function enterHomeMode(button) {
  fireEvent.click(button);
  await waitFor(() => expect(document.querySelector('.route-view-enter')).toBeInTheDocument(), { timeout: 1500 });
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
  window.localStorage.removeItem(UPDATE_NOTICE_STORAGE_KEY);
});

describe('App 交互', () => {
  it('首次从主页进入时显示更新公告，确认后记住已读状态', () => {
    window.history.replaceState({}, '', '/');
    render(<App songs={songs} presets={presets} />);
    expect(screen.getByRole('dialog', { name: '2026-08-29更新' })).toBeVisible();
    expect(screen.getByText('1. 模式上新')).toBeVisible();
    expect(screen.getByText('2. 曲库优化')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '知道了，开始探索' }));
    expect(screen.queryByRole('dialog', { name: '2026-08-29更新' })).toBeNull();
    expect(window.localStorage.getItem(UPDATE_NOTICE_STORAGE_KEY)).toBe('dismissed');
  });

  it('点击主页 QQ 群卡片可以复制群号并显示成功提示', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText } });
    window.history.replaceState({}, '', '/');
    render(<App songs={songs} presets={presets} />);
    fireEvent.click(document.querySelector('.home-header-card.qq-card'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('1087737854'));
    expect(screen.getByRole('status')).toHaveTextContent('已复制群号！');
  });

  it('从其它模式返回主页时不会触发首次公告', () => {
    window.history.replaceState({}, '', '/play/easy');
    render(<App songs={songs} presets={presets} random={() => 0} />);
    expect(screen.queryByRole('dialog', { name: '2026-08-29更新' })).toBeNull();
    window.history.pushState({}, '', '/');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.queryByRole('dialog', { name: '2026-08-29更新' })).toBeNull();
  });

  it('主页按新顺序展示玩法并开放 P 主入口', async () => {
    const { container } = render(<App songs={songs} presets={presets} initialPage="home" />);
    openHomeQuickEntry();
    const cardTitles = [...container.querySelectorAll('.content-card')]
      .map((card) => card.querySelector('.card-copy strong')?.textContent);
    expect(cardTitles).toEqual([
      '曲目猜猜看',
      '多人联机',
      '闪耀的 Producer',
      '歌曲大排序',
      '曲名填字',
      '谁是老资历',
      '听歌识曲',
      '数据库',
    ]);
    expect([...container.querySelectorAll('.content-card .card-index')].map((index) => index.textContent))
      .toEqual(['01', '02', '03', '04', '05', '06', '07']);
    expect(screen.getByRole('button', { name: /^数据库/u }).querySelector('.card-index')).toBeNull();
    const producerCard = screen.getByRole('button', { name: /闪耀的 Producer/u });
    expect(producerCard).toHaveClass('producer-card', 'available');
    await enterHomeMode(producerCard);
    expect(screen.getByRole('heading', { name: '选择挑战范围' })).toBeVisible();
    expect(screen.getByRole('button', { name: /名 P 模式/u })).toHaveTextContent('45 位候选');
    expect(screen.getByRole('button', { name: /全 P 主模式/u })).toHaveTextContent('104 位候选');
    fireEvent.click(screen.getByRole('button', { name: /名 P 模式/u }));
    expect(screen.getByRole('heading', { name: '闪耀的 Producer' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '殿堂及以上' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '代表曲' })).toBeVisible();
  });

  it('全局 BGM 等待主页转场后播放，并在页面切换时保持同一个音频实例', async () => {
    render(<App songs={songs} presets={presets} random={() => 0} initialPage="home" />);
    fireEvent.pointerDown(screen.getByRole('button', { name: '快速入口' }));
    openHomeQuickEntry();
    const audio = document.querySelector('audio');
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled(), { timeout: 1500 });
    audio.currentTime = 42;
    await enterHomeMode(screen.getByRole('button', { name: /曲目猜猜看/u }));
    expect(document.querySelector('audio')).toBe(audio);
    expect(document.querySelector('audio').currentTime).toBe(42);
  });

  it('从主页进入曲库页并通过预设开始', async () => {
    render(<App songs={songs} presets={presets} random={() => 0} initialPage="home" />);
    openHomeQuickEntry();
    await enterHomeMode(screen.getByRole('button', { name: /曲目猜猜看/u }));
    expect(screen.getByText('选择曲库范围')).toBeVisible();
    expect(screen.getByRole('button', { name: /开始游戏 · 2 首/u })).toBeEnabled();
    expect(screen.getByRole('button', { name: /挑战全曲库/u })).toBeVisible();
    expect(screen.getAllByText('洛')).toHaveLength(2);
    expect(screen.getByText('绫')).toBeVisible();
    expect(screen.getByText('言')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /洛天依入门曲库/u }));
    expect(screen.getByText('洛天依入门曲库')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '特殊标注' })).toBeVisible();
  });

  it('从主页进入曲名填字且全局 BGM 不会重新挂载', async () => {
    render(<App random={() => 0.27} initialPage="home" />);
    openHomeQuickEntry();
    const audio = document.querySelector('audio');
    await enterHomeMode(screen.getByRole('button', { name: /曲名填字/u }));
    expect(screen.getByRole('heading', { name: '选择填字曲库' })).toBeVisible();
    expect(screen.getByRole('button', { name: /禾念系/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /五维介质系/u })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^全曲库/u }));
    expect(screen.getByRole('heading', { name: '让熟悉的歌名在交叉处相遇' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: '提交本条' })).toHaveLength(6);
    expect(document.querySelector('audio')).toBe(audio);
  });

  it('从主页进入联网听歌识曲并选择测试歌单', async () => {
    render(<App initialPage="home" />);
    openHomeQuickEntry();
    await enterHomeMode(screen.getByRole('button', { name: /听歌识曲/u }));
    expect(screen.getByRole('heading', { name: '选择猜测歌单' })).toBeVisible();
    expect(screen.getByRole('button', { name: '选择歌单' })).toBeEnabled();
    expect(screen.getByRole('link', { name: /网易云歌单（部分）/u })).toHaveAttribute('href', 'https://music.163.com/#/playlist?id=18330761615');
  });

  it('从主页为谁是老资历选择曲库后开始，且全局 BGM 不会重新挂载', async () => {
    render(<App songs={songs} presets={presets} random={() => 0} initialPage="home" />);
    openHomeQuickEntry();
    const audio = document.querySelector('audio');
    await enterHomeMode(screen.getByRole('button', { name: /谁是老资历/u }));
    expect(screen.getByRole('heading', { name: '选择曲库范围' })).toBeVisible();
    expect(screen.getByRole('button', { name: /开始比较 · 2 首/u })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /挑战全曲库/u }));
    expect(screen.getByRole('heading', { name: '这次要找更早，还是更新？' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /谁是老资历/u }));
    expect(screen.getByRole('heading', { name: '谁是老资历' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /作为更早发布的歌曲/u })).toHaveLength(2);
    expect(document.querySelector('audio')).toBe(audio);
  });

  it('通过 URL 参数恢复小资历模式', () => {
    window.history.replaceState({}, '', '/seniority/preset/all?mode=newer');
    render(<App songs={songs} presets={presets} database={database} random={() => 0} />);
    expect(screen.getByRole('heading', { name: '谁是小资历' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /作为更新发布的歌曲/u })).toHaveLength(2);
  });

  it('从主页进入歌曲大排序模式页且全局 BGM 不会重新挂载', async () => {
    render(<App random={() => 0.17} initialPage="home" />);
    openHomeQuickEntry();
    const audio = document.querySelector('audio');
    await enterHomeMode(screen.getByRole('button', { name: /歌曲大排序/u }));
    expect(screen.getByRole('heading', { name: '选择曲库范围' })).toBeVisible();
    expect(screen.getByRole('button', { name: /进入排序 · 519 首/u })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /挑战全曲库/u }));
    expect(screen.getByRole('heading', { name: '把熟悉的歌放回时间线' })).toBeVisible();
    expect(screen.getByRole('button', { name: /时间线排序/u })).toBeVisible();
    expect(screen.getByRole('button', { name: /年份归位/u })).toBeVisible();
    expect(document.querySelector('audio')).toBe(audio);
  });

  it('从主页选择歌姬并浏览、搜索数据库和打开详情', async () => {
    render(<App songs={songs} presets={presets} database={database} initialPage="home" />);
    openHomeQuickEntry();
    const audio = document.querySelector('audio');
    await enterHomeMode(screen.getByRole('button', { name: /^数据库/u }));
    expect(screen.getByRole('heading', { name: '选择数据库' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^全曲库/u })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /洛天依/u }));
    expect(screen.getByRole('heading', { name: '洛天依曲库资料' })).toBeVisible();
    expect(screen.getByText('2 / 2 首')).toBeVisible();
    expect(document.querySelector('audio')).toBe(audio);

    fireEvent.change(screen.getByRole('searchbox', { name: /搜索曲名/u }), { target: { value: '猜测歌词' } });
    expect(screen.getByText('1 / 2 首')).toBeVisible();
    fireEvent.click(screen.getByText('《猜测曲》'));
    const dialog = screen.getByRole('dialog', { name: '《猜测曲》' });
    expect(within(dialog).getByText('UP主：乙；作词：甲')).toBeVisible();
    expect(within(dialog).getByRole('link', { name: /Bilibili/u })).toHaveAttribute('href', songs[1].bilibiliUrl);
  });

  it('数据库首项可进入全曲库总览', async () => {
    render(<App songs={songs} presets={presets} database={database} initialPage="home" />);
    openHomeQuickEntry();
    await enterHomeMode(screen.getByRole('button', { name: /^数据库/u }));
    fireEvent.click(screen.getByRole('button', { name: /^全曲库/u }));
    expect(screen.getByRole('heading', { name: '全曲库资料' })).toBeVisible();
    expect(screen.getByText('2 / 2 首')).toBeVisible();
  });

  it('P 主数据库与全曲库并列并可搜索资料', async () => {
    render(<App songs={songs} presets={presets} database={database} initialPage="home" />);
    openHomeQuickEntry();
    await enterHomeMode(screen.getByRole('button', { name: /^数据库/u }));
    const featured = document.querySelector('.database-featured-grid');
    expect(within(featured).getByRole('button', { name: /^全曲库/u })).toBeVisible();
    fireEvent.click(within(featured).getByRole('button', { name: /P 主数据库/u }));
    expect(screen.getByRole('heading', { name: 'P 主数据库' })).toBeVisible();
    expect(screen.getByText('104 / 104 位')).toBeVisible();
    fireEvent.change(screen.getByLabelText('搜索名称、别名、出道曲或代表曲'), { target: { value: '我唱人间' } });
    expect(screen.getByText('Suya')).toBeVisible();
  });

  it('第一次同时揭示歌姬与发布时间，随后揭示 STAFF 和歌词', () => {
    renderGame();
    const answerRow = screen.getByText('UP主：甲；作曲：甲').closest('tr');
    fireEvent.click(screen.getByRole('button', { name: /歌姬与发布时间/u }));
    expect(within(answerRow).getByText('2020-03').closest('.revealed')).toBeInTheDocument();
    expect(within(answerRow).getByText('洛天依').closest('.revealed')).toBeInTheDocument();
    expect(within(answerRow).getByText('UP主：甲；作曲：甲').closest('.blurred')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /揭示 STAFF/u }));
    expect(within(answerRow).getByText('UP主：甲；作曲：甲').closest('.revealed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /揭示歌词/u }));
    expect(screen.getByText('答案歌词完整的一行')).toBeVisible();
  });

  it('局部高亮重合人员并显示发布时间与次数方向', () => {
    renderGame();
    submitTitle('猜测曲');
    const guessRow = screen.getByText('猜测曲').closest('tr');
    expect(within(guessRow).getByText('甲')).toHaveClass('exact');
    expect(within(guessRow).getByText('乙')).not.toHaveClass('exact');
    expect(within(guessRow).getByText('2019')).toHaveClass('near');
    expect(within(guessRow).getAllByLabelText('答案更大或更晚').length).toBeGreaterThan(0);
    expect(within(guessRow).getByText('猜测曲')).not.toHaveClass('exact');
  });

  it('年份相同且集合与特殊标注相同时自动显示歌词，忽略月份和次数', () => {
    const matchingGuess = { ...songs[0], id: 'matching', title: '另一曲', releaseMonth: '2020-11', concertCount: 99, bilibiliUrl: 'https://www.bilibili.com/video/av3', vcpediaUrl: 'https://vcpedia.cn/另一曲' };
    renderGame([songs[0], matchingGuess]);
    submitTitle('另一曲');
    expect(screen.getByText('现有线索已全部匹配，已自动揭示歌词')).toBeVisible();
    expect(screen.getByText('答案歌词完整的一行')).toBeVisible();
  });

  it('答对后显示 Bilibili 与 VCPedia 两个外链', () => {
    renderGame();
    submitTitle('答案曲');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /Bilibili 原视频/u })).toHaveAttribute('href', songs[0].bilibiliUrl);
    expect(within(dialog).getByRole('link', { name: /VCPedia.cn 页面/u })).toHaveAttribute('href', songs[0].vcpediaUrl);
  });

  it('投降后也显示鼓励文案与两个外链', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: '投降' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('虽然没猜出来，但恭喜你发现了一首值得一听的歌曲！')).toBeVisible();
    expect(within(dialog).getAllByRole('link')).toHaveLength(2);
  });

  it('开发环境显示开发者入口', () => {
    renderGame();
    expect(screen.getByRole('button', { name: '开发者' })).toBeVisible();
  });
});
