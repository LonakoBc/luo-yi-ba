import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SortingPage from './SortingPage';

const songs = Array.from({ length: 12 }, (_, index) => ({
  id: `song-${index}`,
  title: `歌曲${index}`,
  staffDisplay: `UP主：作者${index}`,
  releaseMonth: `${2012 + index}-${String((index % 12) + 1).padStart(2, '0')}`,
}));
const Brand = () => <div>洛一把</div>;

describe('歌曲大排序页面', () => {
  it('可选择题量、进入时间线模式、调整顺序并查看结算答案', () => {
    render(<SortingPage songs={songs} random={() => 0} onBack={() => {}} Brand={Brand} />);
    expect(screen.getByRole('heading', { name: '把熟悉的歌放回时间线' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '10 首' }));
    fireEvent.click(screen.getByRole('button', { name: '开始排序 · 10 首' }));
    fireEvent.click(screen.getAllByRole('button', { name: /下移/u })[0]);
    fireEvent.click(screen.getByRole('button', { name: '提交排序' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/\/ 10/u)).toBeVisible();
    expect(within(dialog).getByRole('list', { name: '正确发布时间顺序' })).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '查看答案' }));
    expect(screen.getAllByText(/位置正确|位置不符/u)).toHaveLength(10);
  });

  it('年份归位必须为全部歌曲选择年份后才能提交', () => {
    render(<SortingPage songs={songs} random={() => 0.2} onBack={() => {}} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: /年份归位/u }));
    fireEvent.click(screen.getByRole('button', { name: '开始排序 · 5 首' }));
    const submit = screen.getByRole('button', { name: '提交排序' });
    expect(submit).toBeDisabled();
    const selects = screen.getAllByRole('combobox');
    const years = within(selects[0]).getAllByRole('option').slice(1).map((option) => option.value);
    selects.forEach((select, index) => fireEvent.change(select, { target: { value: years[index] } }));
    expect(submit).toBeEnabled();
  });
});
