import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

const songs = [
  {
    id: 'answer', title: '答案曲', staffDisplay: 'UP主：甲；作曲：甲', staffPeople: ['甲'], releaseMonth: '2020-03',
    singersDisplay: '洛天依', singerMembers: ['洛天依'], voicebanksDisplay: 'VOCALOID', voicebankMembers: ['VOCALOID'],
    concertCount: 3, special: '单曲', lyrics: '答案歌词完整的一行',
    bilibiliUrl: 'https://www.bilibili.com/video/av1', vcpediaUrl: 'https://vcpedia.cn/答案曲',
  },
  {
    id: 'guess', title: '猜测曲', staffDisplay: 'UP主：乙；作词：甲', staffPeople: ['乙', '甲'], releaseMonth: '2019-04',
    singersDisplay: '洛天依；言和', singerMembers: ['洛天依', '言和'], voicebanksDisplay: 'VOCALOID；ACE Studio', voicebankMembers: ['VOCALOID', 'ACE Studio'],
    concertCount: 1, special: '系列/企划曲目', lyrics: '猜测歌词完整的一行',
    bilibiliUrl: 'https://www.bilibili.com/video/av2', vcpediaUrl: 'https://vcpedia.cn/猜测曲',
  },
];

const presets = [
  { id: 'intro', name: '入门曲库', description: '精选作品', titles: songs.map(({ title }) => title) },
  { id: 'luotianyi', name: '洛天依传说曲', description: '完整曲库', titles: songs.map(({ title }) => title) },
  { id: 'golden-age', name: '黄金时代', description: '黄金时期', titles: songs.map(({ title }) => title) },
];

function submitTitle(title) {
  const input = screen.getByLabelText('输入你猜测的歌曲');
  fireEvent.change(input, { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: '提交猜测' }));
}

function renderGame(customSongs = songs) {
  return render(<App songs={customSongs} presets={presets.map((preset) => ({ ...preset, titles: customSongs.map(({ title }) => title) }))} random={() => 0} initialPage="game" initialMode="hard" />);
}

describe('App 交互', () => {
  it('全局 BGM 播放器在页面切换时保持同一个音频实例', () => {
    render(<App songs={songs} presets={presets} random={() => 0} initialPage="home" />);
    const audio = document.querySelector('audio');
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    audio.currentTime = 42;
    fireEvent.click(screen.getByRole('button', { name: /猜歌/u }));
    expect(document.querySelector('audio')).toBe(audio);
    expect(document.querySelector('audio').currentTime).toBe(42);
  });

  it('从主页进入曲库页并通过预设开始', () => {
    render(<App songs={songs} presets={presets} random={() => 0} initialPage="home" />);
    fireEvent.click(screen.getByRole('button', { name: /猜歌/u }));
    expect(screen.getByText('选择曲库范围')).toBeVisible();
    expect(screen.getByRole('button', { name: /开始游戏 · 2 首/u })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /入门曲库/u }));
    expect(screen.getByText('入门曲库')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '特殊标注' })).toBeVisible();
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
