import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackWidget from './FeedbackWidget';
import { listFeedback, submitFeedback } from '../services/feedbackClient';

vi.mock('../services/feedbackClient', () => ({ listFeedback: vi.fn(), submitFeedback: vi.fn() }));
vi.mock('../services/toyService', () => ({ IS_TOY_BUILD: false, getToyUserProfile: vi.fn() }));

describe('意见箱', () => {
  beforeEach(() => {
    listFeedback.mockResolvedValue([]);
    submitFeedback.mockResolvedValue({
      id: 'one', category: 'catalog', content: '万象霜天应属于拜年曲', status: 'pending',
      author: { displayName: '测试者' }, context: {}, createdAt: new Date().toISOString(),
    });
  });

  it('默认只占用细长入口，展开后可提交待审核纠错', async () => {
    render(<FeedbackWidget />);
    expect(screen.queryByRole('heading', { name: '意见箱' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '意见箱' }));
    expect(await screen.findByRole('heading', { name: '意见箱' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('称呼'), { target: { value: '测试者' } });
    fireEvent.change(screen.getByLabelText('内容'), { target: { value: '万象霜天应属于拜年曲' } });
    fireEvent.click(screen.getByRole('button', { name: '提交意见' }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith(expect.objectContaining({
      category: 'catalog', content: '万象霜天应属于拜年曲', displayName: '测试者',
    })));
    expect(await screen.findByText('提交成功，审核通过后会公开显示')).toBeInTheDocument();
    expect(screen.getByText('待审核', { exact: false })).toBeInTheDocument();
  });

  it('可进入管理员审核页', async () => {
    const onOpenAdmin = vi.fn();
    render(<FeedbackWidget onOpenAdmin={onOpenAdmin} />);
    fireEvent.click(screen.getByRole('button', { name: '意见箱' }));
    fireEvent.click(await screen.findByRole('button', { name: '管理员入口' }));
    expect(onOpenAdmin).toHaveBeenCalledOnce();
  });
});
