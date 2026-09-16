import { describe, expect, it } from 'vitest';

import type { PreparedReadwiseApiAnnotation } from '../../lib/core/readwise/readwiseApiImport.js';

import {
  matchReadwiseCutoverAnnotations,
  type LegacyAnnotationCandidate
} from './readwiseSourceCutoverAnnotationMatching.js';

describe('Readwise cutover annotation matching', () => {
  it('binds exact, normalized, and uniquely contained text without consuming clozes', () => {
    const bindings = matchReadwiseCutoverAnnotations([
      candidate('exact', 'Exact text'),
      candidate('markdown', '* First\n* Second'),
      candidate('truncated', 'A sufficiently long beginning that was truncated'),
      candidate('cloze', 'Exact text', { kind: 'cloze' })
    ], [
      annotation('remote-exact', 'Exact text'),
      annotation('remote-markdown', '• First\n• Second'),
      annotation('remote-truncated', 'Heading\n\nA sufficiently long beginning that was truncated after export')
    ], new Set());

    expect(bindings).toEqual([
      { kind: 'highlight', nodeId: 'exact', remoteId: 'remote-exact' },
      { kind: 'highlight', nodeId: 'markdown', remoteId: 'remote-markdown' },
      { kind: 'highlight', nodeId: 'truncated', remoteId: 'remote-truncated' }
    ]);
  });

  it('chooses the original imported duplicate that owns local descendants', () => {
    const bindings = matchReadwiseCutoverAnnotations([
      candidate('later', 'Same text', { createdAt: '2026-06-01', imported: true }),
      candidate('original', 'Same text', { childCount: 2, createdAt: '2026-05-01', imported: true })
    ], [annotation('remote', 'Same text')], new Set());

    expect(bindings).toEqual([{ kind: 'highlight', nodeId: 'original', remoteId: 'remote' }]);
  });

  it('uses the earliest imported duplicate when neither owns local descendants', () => {
    const bindings = matchReadwiseCutoverAnnotations([
      candidate('later', 'Same text', { createdAt: '2026-06-01', imported: true }),
      candidate('earlier', 'Same text', { createdAt: '2026-05-01', imported: true })
    ], [annotation('remote', 'Same text')], new Set());

    expect(bindings[0]?.nodeId).toBe('earlier');
  });

  it('normalizes equivalent exported links and escaped Markdown punctuation', () => {
    const local = 'Before\n\n<https://example.com/path>After color\\_grade';
    const remote = 'Before\n\n[https://example.com/path](https://example.com/path)\n\nAfter color_grade';

    expect(matchReadwiseCutoverAnnotations(
      [candidate('markdown-export', local)], [annotation('remote', remote)], new Set()
    )).toEqual([{ kind: 'highlight', nodeId: 'markdown-export', remoteId: 'remote' }]);
  });

  it('does not guess between duplicate local highlights or bind blocked remote annotations', () => {
    const candidates = [candidate('one', 'Same text'), candidate('two', 'Same text')];
    expect(matchReadwiseCutoverAnnotations(candidates, [annotation('remote', 'Same text')], new Set()))
      .toEqual([]);
    expect(matchReadwiseCutoverAnnotations(
      [candidate('one', 'Unique text')], [annotation('blocked', 'Unique text')], new Set(['blocked'])
    )).toEqual([]);
  });
});

function candidate(id: string, text: string, options: {
  childCount?: number;
  createdAt?: string;
  imported?: boolean;
  kind?: 'cloze' | 'highlight';
} = {}): LegacyAnnotationCandidate {
  return {
    anchorLink: JSON.stringify({
      id: options.imported ? `imported-highlight-${id}` : `anchor-${id}`,
      kind: options.kind ?? 'highlight', locator: { from: 0, originalText: text, to: text.length }
    }),
    childCount: options.childCount ?? 0,
    content: '',
    createdAt: options.createdAt ?? '2026-05-01',
    id,
    isTitleManual: 0,
    title: text
  };
}

function annotation(remoteId: string, locatorText: string): PreparedReadwiseApiAnnotation {
  return {
    content: locatorText,
    contentHash: `hash-${remoteId}`,
    kind: 'highlight',
    locatorText,
    parentRemoteId: 'document',
    remoteId,
    updatedAt: null
  };
}
