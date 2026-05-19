import { describe, expect, it } from 'vitest';

import { resolveMarkdownTableRepair } from './markdownTableRepair';

describe('resolveMarkdownTableRepair', () => {
  it('removes blank lines between existing GFM table rows around the cursor', () => {
    const source = [
      'Intro',
      '',
      '| 考点代码: | 1021201 |',
      '',
      '| --- | --- |',
      '',
      '| 考点名称: | 华中科技大学 |',
      '',
      'Tail'
    ].join('\n');

    const edit = resolveMarkdownTableRepair(source, {
      from: source.indexOf('---'),
      to: source.indexOf('---')
    });

    expect(edit).toEqual({
      from: source.indexOf('| 考点代码'),
      to: source.indexOf('\nTail'),
      content: '| 考点代码: | 1021201 |\n| --- | --- |\n| 考点名称: | 华中科技大学 |\n'
    });
  });

  it('creates a delimiter row for selected pipe rows without one', () => {
    const source = '| 考点代码: | 1021201 |\n\n| 考点名称: | 华中科技大学 |';

    expect(resolveMarkdownTableRepair(source, { from: 0, to: source.length })).toEqual({
      from: 0,
      to: source.length,
      content: '| 考点代码: | 1021201 |\n| --- | --- |\n| 考点名称: | 华中科技大学 |'
    });
  });

  it('does not repair fenced code blocks', () => {
    const source = ['```', '| A | B |', '', '| --- | --- |', '', '| 1 | 2 |', '```'].join('\n');

    expect(resolveMarkdownTableRepair(source, { from: source.indexOf('---'), to: source.indexOf('---') })).toBeNull();
  });

  it('repairs selected table blocks without changing surrounding text', () => {
    const source = ['Before', '| A | B |', '', '| --- | --- |', '', '| 1 | 2 |', 'After'].join('\n');
    const from = source.indexOf('| A');
    const to = source.indexOf('After');

    expect(resolveMarkdownTableRepair(source, { from, to })).toEqual({
      from,
      to,
      content: '| A | B |\n| --- | --- |\n| 1 | 2 |\n'
    });
  });
});
