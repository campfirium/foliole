// @vitest-environment node

import { expect, it } from 'vitest';

import { buildPreparedImportRecord, resolveImportKind } from './importSourcePipeline.js';

it('recognizes epub files as importable long-form sources', () => {
  expect(resolveImportKind('/tmp/book.epub')).toBe('epub');
});

it('recognizes pdf files as importable long-form sources', () => {
  expect(resolveImportKind('/tmp/paper.pdf')).toBe('pdf');
});

it('keeps the source body intact, returns matched highlights, and appends only unmatched sidecar highlights', () => {
  const prepared = buildPreparedImportRecord(
    {
      filePath: '/tmp/chapter.md',
      kind: 'markdown',
      sourceName: 'chapter.md'
    },
    {
      content:
        '# Chapter\n\nThis is a long paragraph about controlled imports and highlight recovery for complex sources.\n\nAnother paragraph stays unrelated.',
      highlightSidecar: [
        { label: 'Recovered', text: 'controlled imports and highlight recovery' },
        { label: 'Missing', text: 'quote that is not present in the body' }
      ],
      importedAt: '2026-03-22T12:00:00.000Z',
      sourceProfile: 'body_with_highlight_sidecar'
    }
  );

  expect(prepared.content).toContain('# Chapter');
  expect(prepared.nodeTitle).toBe('chapter');
  expect(prepared.content).not.toContain('## Imported Context');
  expect(prepared.content).toContain('## Unmatched Sidecar Highlights');
  expect(prepared.content).toContain('- Missing: quote that is not present in the body');
  expect(prepared.matchedHighlights).toEqual([
    {
      content: 'controlled imports and highlight recovery',
      label: 'Recovered',
      locatorText: 'This is a long paragraph about controlled imports and highlight recovery for complex sources.'
    }
  ]);
  expect(prepared.degradedReason).toContain('1 unmatched sidecar highlight(s)');
});

it('recovers list-heavy and flattened highlights from the source body before marking them unmatched', () => {
  const prepared = buildPreparedImportRecord(
    {
      filePath: '/tmp/readwise.md',
      kind: 'markdown',
      sourceName: 'readwise.md'
    },
    {
      content: [
        '# GTD',
        '',
        'Checklist:',
        '- 是否有项目已无任务？',
        '- 是否有任务长期未触发？',
        '',
        '| 要素 | GTD 原理 | Todoist 中的对应操作 |',
        '| --- | --- | --- |',
        '| 每周回顾 | 保持系统清空 & 当前 | 每周打开 Someday/Waiting/Projects 重新评估 |'
      ].join('\n'),
      highlightSidecar: [
        {
          label: 'Review questions',
          text: ['每周回顾：', '• 是否有项目已无任务？', '• 是否有任务长期未触发？'].join('\n')
        },
        {
          label: 'Table row',
          text: '要素 GTD 原理 Todoist 中的对应操作 每周回顾 保持系统清空 当前 每周打开 Someday/Waiting/Projects 重新评估'
        }
      ],
      importedAt: '2026-03-25T12:00:00.000Z',
      sourceProfile: 'body_with_highlight_sidecar'
    }
  );

  expect(prepared.content).toContain('| 每周回顾 | 保持系统清空 & 当前 | 每周打开 Someday/Waiting/Projects 重新评估 |');
  expect(prepared.nodeTitle).toBe('readwise');
  expect(prepared.content).not.toContain('## Unmatched Sidecar Highlights');
  expect(prepared.matchedHighlights).toEqual([
    {
      content: ['每周回顾：', '• 是否有项目已无任务？', '• 是否有任务长期未触发？'].join('\n'),
      label: 'Review questions',
      locatorText: ['Checklist:', '- 是否有项目已无任务？', '- 是否有任务长期未触发？'].join('\n')
    },
    {
      content: '要素 GTD 原理 Todoist 中的对应操作 每周回顾 保持系统清空 当前 每周打开 Someday/Waiting/Projects 重新评估',
      label: 'Table row',
      locatorText: [
        '| 要素 | GTD 原理 | Todoist 中的对应操作 |',
        '| --- | --- | --- |',
        '| 每周回顾 | 保持系统清空 & 当前 | 每周打开 Someday/Waiting/Projects 重新评估 |'
      ].join('\n')
    }
  ]);
  expect(prepared.degradedReason).toBeNull();
});

it('uses fresh source fingerprints for untracked imports from the same file path', () => {
  const first = buildPreparedImportRecord(
    {
      filePath: '/tmp/chapter.md',
      kind: 'markdown',
      sourceName: 'chapter.md'
    },
    {
      content: '# Chapter',
      importedAt: '2026-03-22T12:00:00.000Z',
      sourceTrackingMode: 'untracked'
    }
  );
  const second = buildPreparedImportRecord(
    {
      filePath: '/tmp/chapter.md',
      kind: 'markdown',
      sourceName: 'chapter.md'
    },
    {
      content: '# Chapter',
      importedAt: '2026-03-22T12:05:00.000Z',
      sourceTrackingMode: 'untracked'
    }
  );

  expect(first.sourceLocator).toBe('/tmp/chapter.md');
  expect(second.sourceLocator).toBe('/tmp/chapter.md');
  expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint);
});
