import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuessValue } from './SongTable';

describe('SongTable', () => {
  it('将展示文本 Minus 与内部规范名永夜Minus正确匹配并高亮', () => {
    render(
      <GuessValue
        field="singers"
        song={{ singersDisplay: '赤羽；Minus；牧心' }}
        feedback={{ singers: { matches: ['赤羽', '永夜minus', '牧心'] } }}
      />,
    );

    expect(screen.getByText('Minus')).toHaveClass('exact');
  });
});
