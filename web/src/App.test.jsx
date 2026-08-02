import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

const songs = [
  {
    id: 'answer', title: '答案曲', staffDisplay: '甲（UP主）', staffMembers: ['甲'], year: 2020,
    voicebank: 'VOCALOID', vocalType: '独唱', special: '无', lyrics: '答案歌词完整的一行',
    bilibiliUrl: 'https://www.bilibili.com/video/av1',
  },
  {
    id: 'guess', title: '猜测曲', staffDisplay: '乙（UP主）', staffMembers: ['乙'], year: 2019,
    voicebank: 'ACE', vocalType: '合唱', special: '无', lyrics: '猜测歌词完整的一行',
    bilibiliUrl: 'https://www.bilibili.com/video/av2',
  },
];

function submitTitle(title) {
  const input = screen.getByLabelText('输入你猜测的歌曲');
  fireEvent.change(input, { target: { value: title } });
  fireEvent.click(screen.getByRole('button', { name: '提交猜测' }));
}

function renderGame() {
  return render(<App songs={songs} simpleSongsOverride={songs} random={() => 0} initialPage="game" initialMode="hard" />);
}

describe('App 交互', () => {
  it('全局 BGM 播放器在页面切换时保持同一个音频实例', () => {
    render(<App songs={songs} simpleSongsOverride={songs} random={() => 0} initialPage="home" />);
    const audio = document.querySelector('audio');
    expect(screen.getByRole('button', { name: '播放背景音乐' })).toBeVisible();
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    audio.currentTime = 42;
    fireEvent.click(screen.getByRole('button', { name: /猜歌/u }));
    expect(document.querySelector('audio')).toBe(audio);
    expect(document.querySelector('audio').currentTime).toBe(42);
  });

  it('从主页进入模式选择并启动简单模式', () => {
    render(<App songs={songs} simpleSongsOverride={songs} random={() => 0} initialPage="home" />);
    expect(screen.getByText('传说曲猜猜看')).toBeVisible();
    expect(screen.getByText(/传说曲是对播放量/)).toBeVisible();
    expect(screen.getByRole('link', { name: '二刺猿笑传之猜猜呗' })).toHaveAttribute('href', 'https://anime-character-guessr.netlify.app/');
    expect(screen.getByRole('link', { name: '萌娘百科' })).toHaveAttribute('href', 'https://mzh.moegirl.org.cn/Mainpage#/flow');
    fireEvent.click(screen.getByRole('button', { name: /猜歌/u }));
    expect(screen.getByText('选择你的挑战难度')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /简单模式/u }));
    expect(screen.getByText('简单模式 · 精选曲库')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: '特殊说明' })).not.toBeInTheDocument();
  });

  it('按顺序揭示年份、STAFF 和表格外歌词', () => {
    renderGame();
    const answerRow = screen.getByText('甲（UP主）').closest('tr');
    expect(within(answerRow).getByText('甲（UP主）').closest('.blurred')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /揭示年份/u }));
    expect(within(answerRow).getByText('2020').closest('.revealed')).toBeInTheDocument();
    expect(within(answerRow).getByText('甲（UP主）').closest('.blurred')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /揭示 STAFF/u }));
    expect(within(answerRow).getByText('甲（UP主）').closest('.revealed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /揭示歌词/u }));
    expect(screen.getByText('答案歌词完整的一行')).toBeVisible();
    expect(screen.getByRole('button', { name: '提示已全部使用' })).toBeDisabled();
  });

  it('显示错误反馈并在答对后弹出原视频链接', () => {
    renderGame();
    submitTitle('猜测曲');
    expect(screen.getByText('2019 ↑')).toBeVisible();
    expect(screen.getAllByLabelText('相近').length).toBeGreaterThan(0);

    submitTitle('答案曲');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('恭喜答对！')).toBeVisible();
    expect(within(dialog).getByRole('link', { name: /Bilibili 原视频/u })).toHaveAttribute('href', songs[0].bilibiliUrl);
    expect(screen.getByLabelText('输入你猜测的歌曲')).toBeDisabled();
  });

  it('关闭结算后可查看结果并开始不重复的新一局', () => {
    renderGame();
    submitTitle('答案曲');
    fireEvent.click(screen.getByRole('button', { name: '查看结果' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '再来一局' }));
    submitTitle('猜测曲');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('投降后展示鼓励文案并揭晓答案', () => {
    renderGame();
    fireEvent.click(screen.getByRole('button', { name: '投降' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('虽然没猜出来，但恭喜你发现了一首值得一听的歌曲！')).toBeVisible();
    expect(within(dialog).getByText('《答案曲》')).toBeVisible();
  });

  it('默认隐藏开发者入口', () => {
    renderGame();
    expect(screen.queryByRole('button', { name: '开发者' })).not.toBeInTheDocument();
  });
});
