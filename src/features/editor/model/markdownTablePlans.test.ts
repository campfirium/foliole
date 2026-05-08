import { describe, expect, it } from 'vitest';

import { collectMarkdownTablePlans, collectViewportMarkdownTablePlans } from './markdownTablePlans';

describe('markdownTablePlans', () => {
  it('collects GFM table block, row, and cell ranges', () => {
    const text = ['Intro', '| A | B |', '| --- | --- |', '| 1 | 2 |', '', 'Tail'].join('\n');
    const table = collectMarkdownTablePlans({ activePosition: null, from: 0, text })[0];

    expect(table).toMatchObject({
      active: false,
      columnCount: 2
    });
    expect(table?.from).toBe(text.indexOf('| A'));
    expect(table?.to).toBe(text.indexOf('| 1') + '| 1 | 2 |'.length);
    expect(table?.rows.map((row) => row.kind)).toEqual(['header', 'body']);
    expect(table?.rows[0]?.cells.map((cell) => cell.text)).toEqual(['A', 'B']);
    expect(table?.rows[1]?.cells.map((cell) => cell.text)).toEqual(['1', '2']);
  });

  it('marks the whole table active when the cursor is inside the table block', () => {
    const text = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const table = collectMarkdownTablePlans({ activePosition: text.indexOf('1'), from: 10, text })[0];

    expect(table?.active).toBe(true);
  });

  it('keeps table-scoped anchor decorations with the plan', () => {
    const text = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const table = collectMarkdownTablePlans({
      activePosition: null,
      anchorDecorations: [{ from: 10 + text.indexOf('1'), kind: 'highlight', to: 10 + text.indexOf('1') + 1 }],
      from: 10,
      text
    })[0];

    expect(table?.anchorDecorations).toEqual([{ from: 36, kind: 'highlight', to: 37 }]);
  });

  it('collects GFM table column alignment from the delimiter row', () => {
    const text = '| A | B | C |\n| :--- | ---: | :---: |\n| 1 | 2 | 3 |';
    const table = collectMarkdownTablePlans({ activePosition: null, from: 0, text })[0];

    expect(table?.rows[0]?.cells.map((cell) => cell.align)).toEqual(['left', 'right', 'center']);
    expect(table?.rows[1]?.cells.map((cell) => cell.align)).toEqual(['left', 'right', 'center']);
  });

  it('builds a visible table fragment when the viewport starts in the middle of a long table', () => {
    const rows = Array.from({ length: 20 }, (_, index) => `| Row ${index + 1} | Value ${index + 1} |`);
    const text = ['Intro', '| Name | Value |', '| --- | --- |', ...rows, 'Tail'].join('\n');
    const tables = collectMarkdownTablePlans({ activePosition: null, from: 0, text });
    const row12From = text.indexOf('| Row 12');
    const row14To = text.indexOf('| Row 14') + '| Row 14 | Value 14 |'.length;
    const viewportTables = collectViewportMarkdownTablePlans(tables, { from: row12From, to: row14To });

    expect(viewportTables).toHaveLength(1);
    expect(viewportTables[0]?.from).toBe(text.indexOf('| Name'));
    expect(viewportTables[0]?.renderFrom).toBe(row12From);
    expect(viewportTables[0]?.rows.map((row) => row.cells[0]?.text)).toEqual(['Name', 'Row 12', 'Row 13', 'Row 14']);
  });
});
