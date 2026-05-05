import { describe, expect, it } from 'vitest';

import { alignSourceUpdateLines } from './sourceUpdateLineAlignment';

describe('alignSourceUpdateLines', () => {
  it('keeps similar edited lines paired when only a suffix changed', () => {
    const rows = alignSourceUpdateLines(
      ['intro', '    * **低成本试错：** 写文档 $C$ 极低。', 'tail'].join('\n'),
      ['intro', '    * **低成本试错：** 写文档 $C$ 极低。123', 'tail'].join('\n')
    );

    expect(rows).toContainEqual({
      currentLine: '    * **低成本试错：** 写文档 $C$ 极低。',
      updatedLine: '    * **低成本试错：** 写文档 $C$ 极低。123'
    });
  });

  it('does not pair a heading with unrelated inserted number lines in the same changed block', () => {
    const rows = alignSourceUpdateLines(
      ['alpha', '### 📂 其他重要观点摘要 (Brief Summary)', 'omega'].join('\n'),
      ['alpha', '123', '123', '### 📂 其他重要观点摘要 (Brief Summary)123132', 'omega'].join('\n')
    );

    expect(rows).toEqual([
      { currentLine: 'alpha', updatedLine: 'alpha' },
      { currentLine: null, updatedLine: '123' },
      { currentLine: null, updatedLine: '123' },
      {
        currentLine: '### 📂 其他重要观点摘要 (Brief Summary)',
        updatedLine: '### 📂 其他重要观点摘要 (Brief Summary)123132'
      },
      { currentLine: 'omega', updatedLine: 'omega' }
    ]);
  });
});
