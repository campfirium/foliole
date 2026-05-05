import { describe, expect, it } from 'vitest';

import { getSelectionCommandPayload } from './contextCommands';

function createAdapter(content: string, from: number, to: number) {
  return {
    getContent: () => content,
    getSelection: () => ({ from, to })
  };
}

describe('contextCommands', () => {
  it('preserves line breaks when building cloze content from selection', () => {
    const content = '# Title\n\nFirst line\nSecond line';
    const from = content.indexOf('First');
    const to = from + 'First line'.length;
    const payload = getSelectionCommandPayload('node-1', createAdapter(content, from, to) as never);

    expect(payload).toMatchObject({
      clozeContent: '# Title\n\n[...]\nSecond line',
      selectionText: 'First line'
    });
  });
});
