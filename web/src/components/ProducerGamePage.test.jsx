import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProducerGamePage from './ProducerGamePage';

const producers = [
  { id: 'answer', name: '答案P', aliases: ['Answer P'], searchKeys: ['答案p', 'answerp'], debutDate: '2014-02-03', debutYear: 2014, debutSong: '出道答案', representativeSongs: ['曲A', '曲B', '曲C', '曲D', '曲E'], hallCount: 20, legendCount: 4, mythCount: 1, famous: true },
  { id: 'guess', name: '猜测P', aliases: [], searchKeys: ['猜测p'], debutDate: '2014-08-09', debutYear: 2014, debutSong: '猜测出道', representativeSongs: ['曲A', '曲F', '曲G', '曲H', '曲I'], hallCount: 18, legendCount: 2, mythCount: 0, famous: true },
];

describe('ProducerGamePage', () => {
  it('三次提示累计揭示，并在同年猜测后自动揭示年份和出道曲', () => {
    render(<ProducerGamePage producers={producers} mode="famous" random={() => 0} onBack={vi.fn()} onChangeMode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /提示 1\/3/u }));
    expect(screen.getByText('出道答案')).toBeVisible();
    expect(screen.getByText('曲E')).toBeVisible();

    const input = screen.getByLabelText('输入你猜测的 P 主');
    fireEvent.change(input, { target: { value: '猜测P' } });
    fireEvent.click(screen.getByRole('button', { name: '猜测P' }));
    expect(screen.getByText('初投稿年份相同，已额外揭示答案的年份与出道曲')).toBeVisible();
    expect(screen.getAllByText('2014').length).toBeGreaterThan(1);
    expect(screen.getByText('出道答案')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /提示 2\/3/u }));
    expect(screen.getByText('20')).toBeVisible();
    expect(screen.getByText('曲D')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /提示 3\/3/u }));
    expect(screen.getByText('曲B')).toBeVisible();
  });

  it('投降后完整揭示并支持更换模式', () => {
    const onChangeMode = vi.fn();
    render(<ProducerGamePage producers={producers} mode="all" random={() => 0} onBack={vi.fn()} onChangeMode={onChangeMode} />);
    fireEvent.click(screen.getByRole('button', { name: '投降' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('答案P')).toBeVisible();
    expect(within(dialog).getByText('2014-02-03')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '更换模式' }));
    expect(onChangeMode).toHaveBeenCalledOnce();
  });
});
