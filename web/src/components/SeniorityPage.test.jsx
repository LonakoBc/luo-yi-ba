import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SeniorityPage from './SeniorityPage';

const songs = [
  { id: 'a', title: '甲曲', releaseMonth: '2015-01', concertCount: 0, staffDisplay: 'UP主：甲', singersDisplay: '洛天依', special: '单曲', imageUrl: null },
  { id: 'b', title: '乙曲', releaseMonth: '2017-02', concertCount: 1, staffDisplay: 'UP主：乙', singersDisplay: '洛天依；乐正绫', special: '系列/企划曲目', imageUrl: 'https://media.vcpedia.cn/test.jpg' },
  { id: 'c', title: '丙曲', releaseMonth: '2018-03', concertCount: 0, staffDisplay: 'UP主：丙', singersDisplay: '言和', special: '单曲', imageUrl: null },
  { id: 'd', title: '丁曲', releaseMonth: '2020-04', concertCount: 0, staffDisplay: 'UP主：丁', singersDisplay: '星尘', special: '生贺曲', imageUrl: null },
];

const Brand = () => <div>洛一把</div>;

describe('谁是老资历页面', () => {
  it('歌曲卡片展示歌姬、特殊标注和演唱会生日会次数', () => {
    render(<SeniorityPage songs={songs} random={() => 0} onBack={() => {}} Brand={Brand} />);
    expect(screen.getAllByText(/歌姬 · /u).length).toBe(2);
    expect(screen.getAllByText(/标注 · /u).length).toBe(2);
    expect(screen.getAllByText(/演出 · \d+ 次/u).length).toBe(2);
  });

  it('选择后揭晓日期，下一轮保留歌曲及其已知发布时间', () => {
    render(<SeniorityPage songs={songs} random={() => 0} onBack={() => {}} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: '选择《甲曲》作为更早发布的歌曲' }));
    expect(screen.getByText('发布时间：2015-01')).toBeVisible();
    expect(screen.getByText('✓ 更早发布')).toBeVisible();
    expect(within(screen.getByText('得分').closest('span')).getByText('1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(screen.getByRole('button', { name: '选择《甲曲》作为更早发布的歌曲' })).toBeVisible();
    expect(screen.getByText('发布时间：2015-01')).toBeVisible();
    expect(screen.getByText('发布时间：????-??')).toBeVisible();
  });

  it('手动结算确认后显示得分、评价和未作答轮次', () => {
    render(<SeniorityPage songs={songs} random={() => 0} onBack={() => {}} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: '结算' }));
    const confirm = screen.getByRole('dialog', { name: '现在结算本局吗？' });
    fireEvent.click(within(confirm).getByRole('button', { name: '确认结算' }));
    const result = screen.getByRole('dialog', { name: '初来乍到' });
    expect(within(result).getByText('— 未作答')).toBeVisible();
    expect(within(result).getByRole('button', { name: '再来一盘' })).toBeVisible();
  });

  it('远程图片加载失败时切换为占位图', () => {
    render(<SeniorityPage songs={songs} random={() => 0.3} onBack={() => {}} Brand={Brand} />);
    const image = screen.queryByRole('img');
    if (image) fireEvent.error(image);
    expect(screen.getAllByLabelText('歌曲图片暂无').length).toBeGreaterThan(0);
  });

  it('不同歌曲卡片生成不同且稳定的填充色并移除 A/B 角标', () => {
    render(<SeniorityPage songs={songs} random={() => 0} onBack={() => {}} Brand={Brand} />);
    const cards = screen.getAllByRole('button', { name: /作为更早发布的歌曲/u });
    expect(cards[0].style.getPropertyValue('--song-card-surface')).not.toBe(cards[1].style.getPropertyValue('--song-card-surface'));
    expect(screen.queryByText('曲目 A')).not.toBeInTheDocument();
    expect(screen.queryByText('曲目 B')).not.toBeInTheDocument();
  });
});
