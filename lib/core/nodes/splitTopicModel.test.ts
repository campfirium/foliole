import { describe, expect, it } from 'vitest';

import { buildSplitTopicNodeOrder, buildSplitTopicPreview } from './splitTopicModel.js';

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

  it('keeps delimiters on following non-empty fragments when requested', () => {
    expect(buildSplitTopicPreview({
      content: 'Alpha\n---\n# Beta',
      delimiter: '---',
      keepDelimiter: true
    })).toEqual([
      { body: 'Alpha\n', title: 'Alpha' },
      { body: '---\n# Beta', title: 'Beta' }
    ]);
  });

  it('adds shared header and footer before deriving titles', () => {
    expect(buildSplitTopicPreview({
      content: 'alpha---beta',
      delimiter: '---',
      footerText: '\nTail',
      headerText: '# Shared\n\n',
      keepDelimiter: false
    })).toEqual([
      { body: '# Shared\n\nalpha\nTail', title: 'Shared' },
      { body: '# Shared\n\nbeta\nTail', title: 'Shared' }
    ]);
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
