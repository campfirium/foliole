// @vitest-environment node

import { expect, it } from 'vitest';

import { buildPreparedImportRecord, resolveImportKind } from './importSourcePipeline.js';

it('recognizes epub files as importable long-form sources', () => {
  expect(resolveImportKind('/tmp/book.epub')).toBe('epub');
});

it('builds controlled context for body plus highlight sidecar imports and keeps degraded mismatches visible', () => {
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
  expect(prepared.content).toContain('## Imported Context');
  expect(prepared.content).toContain('### Recovered');
  expect(prepared.content).toContain('controlled imports and highlight recovery');
  expect(prepared.content).toContain('## Unmatched Sidecar Highlights');
  expect(prepared.content).toContain('- Missing: quote that is not present in the body');
  expect(prepared.degradedReason).toContain('1 unmatched sidecar highlight(s)');
});
