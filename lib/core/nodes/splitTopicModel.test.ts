import { describe, expect, it } from 'vitest';

import { buildSplitTopicNodeOrder, buildSplitTopicParts, buildSplitTopicPreview, mapSplitTopicSourceRange } from './splitTopicModel.js';

describe('buildSplitTopicPreview', () => {
  it('rejects an empty delimiter', () => {
    expect(() => buildSplitTopicPreview({ content: 'A', delimiter: '', keepDelimiter: false })).toThrow(
      'split topic delimiter is required'
    );
  });

  it('returns no generated parts when the delimiter does not exist', () => {
    expect(buildSplitTopicPreview({ content: 'A\nB', delimiter: '---', keepDelimiter: false })).toEqual([]);
  });

  it('filters leading, trailing, consecutive, and whitespace-only fragments', () => {
    expect(buildSplitTopicPreview({
      content: '--- Alpha ---   ---\nBeta\n---',
      delimiter: '---',
      keepDelimiter: false
    })).toEqual([
      { body: ' Alpha ', title: 'Alpha' },
      { body: '\nBeta\n', title: 'Beta' }
    ]);
  });

  it('keeps delimiters at the end of the preceding fragment when requested', () => {
    expect(buildSplitTopicPreview({
      content: 'Alpha\n---\n# Beta',
      delimiter: '---',
      keepDelimiter: true
    })).toEqual([
      { body: 'Alpha\n---', title: 'Alpha' },
      { body: '\n# Beta', title: 'Beta' }
    ]);
  });

  it('adds shared Before and After text without overriding fragment titles', () => {
    expect(buildSplitTopicPreview({
      content: 'alpha---beta',
      delimiter: '---',
      footerText: '\nTail',
      headerText: '# Shared\n\n',
      keepDelimiter: false
    })).toEqual([
      { body: '# Shared\n\nalpha\nTail', title: 'alpha' },
      { body: '# Shared\n\nbeta\nTail', title: 'beta' }
    ]);
  });
});

describe('buildSplitTopicPreview heading promotion', () => {
  it.each([
    ['# H1\n## H2', '# H1\n## H2'],
    ['## H2\n### H3', '# H2\n## H3'],
    ['##### H5\n###### H6', '# H5\n## H6'],
    ['### First\n#### Child\n### Second', '# First\n## Child\n# Second'],
    ['   ### Indented\n    ## Four spaces', '   # Indented\n    ## Four spaces'],
    ['plain body', 'plain body'],
    ['### Title ###\nBody', '# Title ###\nBody']
  ])('promotes headings as one relative hierarchy: %s', (content, expected) => {
    expect(buildSplitTopicPreview({ content: `${content}---tail`, delimiter: '---', keepDelimiter: false })[0]).toMatchObject({ body: expected });
  });

  it('ignores headings in backtick and tilde fences, including longer closing fences', () => {
    const content = '```js\n# Fake\n````\n### Real\n~~~\n## Also fake\n~~~\n---tail';
    expect(buildSplitTopicPreview({ content, delimiter: '---', keepDelimiter: false })[0]).toEqual({
      body: '```js\n# Fake\n````\n# Real\n~~~\n## Also fake\n~~~\n',
      title: 'Real'
    });
  });

  it('derives bounded semantic titles without Part labels', () => {
    const longTitle = 'x'.repeat(120);
    expect(buildSplitTopicPreview({
      content: `# ${longTitle}\nbody---![Cover](asset://hash.png)`,
      delimiter: '---',
      keepDelimiter: false
    })).toEqual([
      { body: `# ${longTitle}\nbody`, title: 'x'.repeat(100) },
      { body: '![Cover](asset://hash.png)', title: 'Cover' }
    ]);
  });
});

describe('buildSplitTopicNodeOrder', () => {
  it('inserts generated topics immediately after the source Topic', () => {
    expect(buildSplitTopicNodeOrder({
      generatedNodeIds: ['part-a', 'part-b'],
      nodeOrder: ['folder', 'source', 'sibling'],
      sourceNodeId: 'source'
    })).toEqual(['folder', 'source', 'part-a', 'part-b', 'sibling']);
  });

  it('removes stale generated ids before reinserting preview order', () => {
    expect(buildSplitTopicNodeOrder({
      generatedNodeIds: ['part-a', 'part-b'],
      nodeOrder: ['source', 'part-b', 'sibling', 'part-a'],
      sourceNodeId: 'source'
    })).toEqual(['source', 'part-a', 'part-b', 'sibling']);
  });
});

describe('mapSplitTopicSourceRange', () => {
  function mapText(content: string, text: string, options: { headerText?: string; keepDelimiter?: boolean } = {}) {
    const from = content.indexOf(text);
    const parts = buildSplitTopicParts({ content, delimiter: '---', keepDelimiter: options.keepDelimiter ?? false, headerText: options.headerText ?? '' });
    for (const part of parts) {
      const mapped = mapSplitTopicSourceRange(part.sourceMap, { from, to: from + text.length });
      if (mapped) return part.body.slice(mapped.from, mapped.to);
    }
    return null;
  }

  it('follows text through header text, kept delimiters, and heading promotion', () => {
    const content = 'Intro text\n---\n### Head\nbody words\n#### Sub\ntail';
    expect(mapText(content, 'Intro', { headerText: '> shared\n' })).toBe('Intro');
    expect(mapText(content, 'body words', { headerText: '> shared\n' })).toBe('body words');
    expect(mapText(content, 'Sub\ntail')).toBe('Sub\ntail');
    expect(mapText(content, 'text\n---', { keepDelimiter: true })).toBe('text\n---');
  });

  it('drops promoted heading markers from a range and rejects ranges across parts', () => {
    const content = 'a---## Head';
    expect(mapText(content, '## Head')).toBe('# Head');
    expect(mapText(content, 'a---#')).toBeNull();
  });
});
