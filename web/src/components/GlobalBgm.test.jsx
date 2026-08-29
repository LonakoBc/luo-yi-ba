import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GlobalBgm from './GlobalBgm';

describe('全局 BGM 播放列表', () => {
  it('根据随机源选择首曲，并在播放结束后自动切换', () => {
    render(<GlobalBgm random={() => 0} />);
    expect(screen.getByText('01-勾指起誓')).toBeVisible();
    fireEvent.ended(document.querySelector('audio'));
    expect(screen.getByText('02-普通DISCO')).toBeVisible();
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('支持手动播放下一首并循环回到首曲', () => {
    render(<GlobalBgm random={() => 0.99} />);
    expect(screen.getByText('12-一半一半')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '播放下一首背景音乐' }));
    expect(screen.getByText('01-勾指起誓')).toBeVisible();
  });

  it('可以展开播放列表并主动选择曲目', () => {
    render(<GlobalBgm random={() => 0} />);
    fireEvent.click(screen.getByRole('button', { name: '选择背景音乐' }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(12);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /10-霜雪千年/u }));
    expect(screen.getByText('10-霜雪千年')).toBeVisible();
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
