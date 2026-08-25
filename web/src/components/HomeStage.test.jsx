import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomeStage from './HomeStage';

function actions() {
  return Object.fromEntries(['guess', 'multiplayer', 'producer', 'sorting', 'crossword', 'seniority', 'database'].map((id) => [id, vi.fn()]));
}

describe('唱片轮盘首页', () => {
  it('点击和方向键会旋转选择，但只有进入按钮才打开玩法', () => {
    const callbacks = actions();
    const { container } = render(<HomeStage actions={callbacks} />);
    expect(screen.getByRole('heading', { name: '曲目猜猜看' })).toBeVisible();
    fireEvent.click(container.querySelector('.home-stage-next'));
    expect(screen.getByRole('heading', { name: '多人联机' })).toBeVisible();
    expect(callbacks.multiplayer).not.toHaveBeenCalled();
    expect(container.querySelector('.home-disc')).toHaveAttribute('style', expect.stringContaining('-51.428'));
    fireEvent.keyDown(screen.getByLabelText('首页玩法轮盘'), { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: '闪耀的 Producer' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '进入当前玩法' }));
    expect(callbacks.producer).toHaveBeenCalledOnce();
  });

  it('旧版快速入口默认收起，展开后仍可直接进入任意模式', () => {
    const callbacks = actions();
    render(<HomeStage actions={callbacks} />);
    expect(screen.getByLabelText('旧版快速切换入口')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: /快速入口/u }));
    expect(screen.getByLabelText('旧版快速切换入口')).toHaveAttribute('aria-hidden', 'false');
    fireEvent.click(screen.getByRole('button', { name: /歌曲大排序/u }));
    expect(callbacks.sorting).toHaveBeenCalledOnce();
  });

  it('滚轮达到阈值后切换一档并显示前后两层 CG', () => {
    const { container } = render(<HomeStage actions={actions()} />);
    fireEvent.wheel(screen.getByLabelText('首页玩法轮盘'), { deltaY: 80, deltaX: 0 });
    expect(screen.getByRole('heading', { name: '多人联机' })).toBeVisible();
    expect(container.querySelectorAll('.home-stage-scene')).toHaveLength(2);
    expect(container.querySelector('.home-stage-scene.previous')).toBeTruthy();
  });
  it('\u6700\u540e\u4e00\u4e2a\u73a9\u6cd5\u7ee7\u7eed\u5411\u4e0b\u65f6\u53ea\u65cb\u8f6c\u4e00\u6863\u5e76\u5faa\u73af\u56de\u5230\u7b2c\u4e00\u4e2a\u73a9\u6cd5', () => {
    const { container } = render(<HomeStage actions={actions()} />);
    const nextButton = container.querySelector('.home-stage-next');
    for (let step = 0; step < 6; step += 1) fireEvent.click(nextButton);
    expect(container.querySelector('.home-disc')).toHaveAttribute('style', expect.stringContaining('-308.571'));
    fireEvent.click(nextButton);
    expect(container.querySelector('.home-disc')).toHaveAttribute('style', expect.stringContaining('-360deg'));
  });

  it('\u79fb\u52a8\u7aef\u5de6\u53f3\u6ed1\u52a8\u53ef\u4ee5\u5207\u6362\u76f8\u90bb\u73a9\u6cd5\uff0c\u5782\u76f4\u6ed1\u52a8\u4e0d\u4f1a\u8bef\u89e6', () => {
    render(<HomeStage actions={actions()} />);
    const stage = screen.getByLabelText('\u9996\u9875\u73a9\u6cd5\u8f6e\u76d8');
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 280, clientY: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 180, clientY: 308 }] });
    expect(screen.getByRole('heading', { name: '\u591a\u4eba\u8054\u673a' })).toBeVisible();
    fireEvent.touchStart(stage, { changedTouches: [{ clientX: 180, clientY: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 175, clientY: 210 }] });
    expect(screen.getByRole('heading', { name: '\u591a\u4eba\u8054\u673a' })).toBeVisible();
  });

});
