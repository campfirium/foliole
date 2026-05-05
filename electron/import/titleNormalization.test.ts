// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { normalizeImportedMarkdownHeadings } from '../../lib/core/import/normalizeImportedHeadings.js';

describe('normalizeImportedMarkdownHeadings', () => {
  it('downgrades the whole document when the highest body heading is level one', () => {
    expect(normalizeImportedMarkdownHeadings('# A\n## B\n### C')).toBe('## A\n### B\n#### C');
  });

  it('keeps the document unchanged when the highest body heading is already level two', () => {
    expect(normalizeImportedMarkdownHeadings('## A\n### B')).toBe('## A\n### B');
  });

  it('lifts the whole document when the highest body heading starts at level three', () => {
    expect(normalizeImportedMarkdownHeadings('### A\n#### B\n##### C')).toBe('## A\n### B\n#### C');
  });

  it('preserves deeper-than-six levels after shifting', () => {
    expect(normalizeImportedMarkdownHeadings('# A\n###### B')).toBe('## A\n####### B');
  });

  it('skips fenced code blocks and blockquotes', () => {
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
      '## A',
      '',
      '> # Quoted heading',
      '',
      '```md',
      '# Code heading',
      '```',
      '',
      '#### B'
    ].join('\n'));
  });
});

describe('createPreparedDesktopTextImport heading normalization', () => {
  it('stores normalized body headings while keeping generated appendix headings and heading titles intact', () => {
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

    expect(prepared.content).toBe('## Imported title\n\n#### Section\n\n## Unmatched Sidecar Highlights\n\n- Missing: quote that is not present');
    expect(prepared.nodeTitle).toBe('Imported title');
    expect(prepared.hideTitleHeading).toBe(true);
  });
});
