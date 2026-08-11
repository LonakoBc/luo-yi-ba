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
    const { container } = render(<SortingPage songs={songs} random={() => 0} onBack={() => {}} Brand={Brand} />);
    expect(screen.getByRole('heading', { name: '把熟悉的歌放回时间线' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '10 首' }));
    fireEvent.click(screen.getByRole('button', { name: '开始排序 · 10 首' }));
    const cardColors = [...container.querySelectorAll('.sorting-timeline > li')].map((item) => item.style.getPropertyValue('--sorting-card-surface'));
    expect(new Set(cardColors).size).toBe(10);
    fireEvent.click(screen.getAllByRole('button', { name: /下移/u })[0]);
    fireEvent.click(screen.getByRole('button', { name: '提交排序' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/\/ 45/u)).toBeVisible();
    expect(within(dialog).getByText(/相对顺序正确率/u)).toBeVisible();
    expect(within(dialog).getByRole('list', { name: '正确发布时间顺序' })).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: '查看答案' }));
    expect(screen.getAllByText(/位置正确|正确第/u)).toHaveLength(10);
  });

  it('年份归位必须为全部歌曲选择年份后才能提交', () => {
    render(<SortingPage songs={songs} random={() => 0.2} onBack={() => {}} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: /年份归位/u }));
    fireEvent.click(screen.getByRole('button', { name: '开始排序 · 5 首' }));
    const submit = screen.getByRole('button', { name: '提交排序' });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('region', { name: '年份备选池' })).toBeVisible();
    const selects = screen.getAllByRole('combobox');
    selects.forEach((select) => {
      const year = within(select).getAllByRole('option').find((option) => option.value);
      fireEvent.change(select, { target: { value: year.value } });
    });
    expect(submit).toBeEnabled();
    const chosenYear = selects[0].value;
    expect(within(selects[1]).queryByRole('option', { name: chosenYear })).not.toBeInTheDocument();
  });

  it('年份备选池支持拖拽和点击分配', () => {
    const { container } = render(<SortingPage songs={songs} random={() => 0.25} onBack={() => {}} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: /年份归位/u }));
    fireEvent.click(screen.getByRole('button', { name: '开始排序 · 5 首' }));
    const bank = screen.getByRole('region', { name: '年份备选池' });
    const [firstYear, secondYear] = within(bank).getAllByRole('button');
    const cards = container.querySelectorAll('.sorting-year-grid article');
    const transfer = {
      values: {},
      setData(type, value) { this.values[type] = value; },
      getData(type) { return this.values[type] ?? ''; },
    };
    fireEvent.dragStart(firstYear, { dataTransfer: transfer });
    fireEvent.dragOver(cards[0], { dataTransfer: transfer });
    fireEvent.drop(cards[0], { dataTransfer: transfer });
    expect(screen.getAllByRole('combobox')[0]).toHaveValue(firstYear.textContent);
    fireEvent.click(secondYear);
    fireEvent.click(cards[1]);
    expect(screen.getAllByRole('combobox')[1]).toHaveValue(secondYear.textContent);
  });

  it('投降需要确认，确认后不计分并揭晓答案', () => {
    render(<SortingPage songs={songs} random={() => 0.3} onBack={() => {}} Brand={Brand} />);
    fireEvent.click(screen.getByRole('button', { name: '开始排序 · 5 首' }));
    fireEvent.click(screen.getByRole('button', { name: '投降' }));
    const confirm = screen.getByRole('dialog', { name: '现在揭晓完整答案吗？' });
    fireEvent.click(within(confirm).getByRole('button', { name: '继续游戏' }));
    expect(screen.getByRole('button', { name: '提交排序' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '投降' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '现在揭晓完整答案吗？' })).getByRole('button', { name: '确认投降' }));
    const result = screen.getByRole('dialog', { name: '本局已投降' });
    expect(within(result).getByText('不计分，完整时间线如下。')).toBeVisible();
  });
});
