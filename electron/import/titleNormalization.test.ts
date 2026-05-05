// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { normalizeImportedMarkdownHeadings } from '../../lib/core/import/normalizeImportedHeadings.js';

describe('normalizeImportedMarkdownHeadings', () => {
  it('keeps a document unchanged when it contains a single level-one heading', () => {
    expect(normalizeImportedMarkdownHeadings('# A\n## B\n### C')).toBe('# A\n## B\n### C');
  });

  it('downgrades the whole document when it contains multiple level-one headings', () => {
    expect(normalizeImportedMarkdownHeadings('# A\n## B\n# C\n## D')).toBe('## A\n### B\n## C\n### D');
  });

  it('keeps the document unchanged when the highest body heading is already level two', () => {
    expect(normalizeImportedMarkdownHeadings('## A\n### B')).toBe('## A\n### B');
  });

  it('lifts the whole document when the highest body heading starts at level three', () => {
    expect(normalizeImportedMarkdownHeadings('### A\n#### B\n##### C')).toBe('## A\n### B\n#### C');
  });

  it('preserves deeper-than-six levels after shifting', () => {
    expect(normalizeImportedMarkdownHeadings('# A\n###### B\n# C')).toBe('## A\n####### B\n## C');
  });

  it('does not count fenced code blocks or blockquotes as level-one headings', () => {
    expect(
      normalizeImportedMarkdownHeadings([
        '# A',
        '',
        '> # Quoted heading',
        '',
        '```md',
        '# Code heading',
        '```',
        '',
        '### B'
      ].join('\n'))
    ).toBe([
      '# A',
      '',
      '> # Quoted heading',
      '',
      '```md',
      '# Code heading',
      '```',
      '',
      '### B'
    ].join('\n'));
  });
});

describe('createPreparedDesktopTextImport heading normalization', () => {
  it('keeps a single title heading while preserving generated appendix headings and heading titles', () => {
    const prepared = createPreparedDesktopTextImport({
      content: '# Imported title\n\n### Section',
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      highlightPolicy: 'reference_only',
      highlightSidecar: [{ label: 'Missing', text: 'quote that is not present' }],
      importedAt: '2026-04-01T00:00:00.000Z',
      kind: 'markdown',
      titleStrategy: 'heading'
    });

    expect(prepared.content).toBe('# Imported title\n\n### Section\n\n## Unmatched Sidecar Highlights\n\n- Missing: quote that is not present');
    expect(prepared.nodeTitle).toBe('Imported title');
    expect(prepared.hideTitleHeading).toBe(true);
  });

  it('still normalizes multi-section level-one headings before writing import content', () => {
    const prepared = createPreparedDesktopTextImport({
      content: '# Part one\n\n## Detail\n\n# Part two',
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      importedAt: '2026-04-01T00:00:00.000Z',
      kind: 'markdown',
      titleStrategy: 'heading'
    });

    expect(prepared.content).toBe('## Part one\n\n### Detail\n\n## Part two');
    expect(prepared.nodeTitle).toBe('note');
    expect(prepared.hideTitleHeading).toBe(false);
  });
});
