import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';

const songs = [
  { id: 'song-a', title: '甲曲', slug: 'jia-qu', imageUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', singersDisplay: '洛天依' },
  { id: 'song-b', title: '乙曲', slug: 'yi-qu', imageUrl: '', singersDisplay: '言和' },
  { id: 'song-c', title: '丙曲', slug: 'bing-qu', imageUrl: '', singersDisplay: '星尘' },
  { id: 'song-d', title: '丁曲', slug: 'ding-qu', imageUrl: '', singersDisplay: '心华' },
];

const producers = [
  { id: 'producer-a', name: '甲P', aliases: [] },
  { id: 'producer-b', name: '乙P', aliases: [] },
];

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('CollectionPage', () => {
  it('提供 30 个栏位，并允许一个栏位最多填入三首歌曲', () => {
    render(<App songs={songs} producers={producers} initialPage="collection" />);
    expect(screen.getAllByText(/0\/3|0\/3/u)).toHaveLength(30);

    fireEvent.click(screen.getAllByRole('button', { name: '填入' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索本地歌曲库' }), { target: { value: '曲' } });
    fireEvent.click(screen.getByRole('button', { name: /甲曲/u }));
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索本地歌曲库' }), { target: { value: '乙曲' } });
    fireEvent.click(screen.getByRole('button', { name: /乙曲/u }));
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索本地歌曲库' }), { target: { value: '丙曲' } });
    fireEvent.click(screen.getByRole('button', { name: /丙曲/u }));
    expect(screen.getAllByText('甲曲').length).toBeGreaterThan(0);
    expect(screen.getAllByText('乙曲').length).toBeGreaterThan(0);
    expect(screen.getAllByText('丙曲').length).toBeGreaterThan(0);
  });

  it('确认后显示成果预览', () => {
    render(<App songs={songs} producers={producers} initialPage="collection" />);
    fireEvent.click(screen.getByRole('button', { name: '确认并生成成果图 →' }));
    expect(screen.getByText('成果预览')).toBeVisible();
    expect(screen.getByRole('textbox', { name: '玩家昵称（可选）' })).toBeVisible();
    expect(screen.getByRole('button', { name: '保存成果图' })).toBeVisible();
  });
});
