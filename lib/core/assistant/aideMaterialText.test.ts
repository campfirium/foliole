import { describe, expect, it } from 'vitest';

import { AIDE_READ_SEGMENT_MAX, searchAideMaterialText, sliceAideMaterialText } from './aideMaterialText.js';

describe('sliceAideMaterialText', () => {
  const body = 'abcdefghij'.repeat(10);

  it('returns the requested segment with its character positions', () => {
    const segment = sliceAideMaterialText(body, 20, 15);
    expect(segment).toEqual({
      content: body.slice(20, 35),
      content_char_count: 100,
      content_end: 35,
      content_offset: 20,
      content_truncated: true
    });
  });

  it('continues exactly where the previous segment ended and marks the last one', () => {
    const first = sliceAideMaterialText(body, 0, 60);
    const second = sliceAideMaterialText(body, first.content_end, 60);
    expect(first.content + second.content).toBe(body);
    expect(second).toMatchObject({ content_end: 100, content_offset: 60, content_truncated: false });
  });

  it('clamps offsets past the end and caps one segment', () => {
    expect(sliceAideMaterialText(body, 500, 10)).toMatchObject({ content: '', content_offset: 100, content_truncated: false });
    const long = 'x'.repeat(AIDE_READ_SEGMENT_MAX * 2);
    expect(sliceAideMaterialText(long, 0, AIDE_READ_SEGMENT_MAX * 2).content_end).toBe(AIDE_READ_SEGMENT_MAX);
  });
});

describe('searchAideMaterialText', () => {
  it('returns each match with positions that point back into the text', () => {
    const body = 'Division of labour. The division of labour raises output. 分工提高效率。';
    const result = searchAideMaterialText(body, 'division');
    expect(result.total).toBe(2);
    for (const match of result.matches) {
      expect(body.slice(match.from, match.to).toLowerCase()).toBe('division');
      expect(match.excerpt).toContain(body.slice(match.from, match.to));
    }
    const cjk = searchAideMaterialText(body, '分工');
    expect(body.slice(cjk.matches[0]?.from, cjk.matches[0]?.to)).toBe('分工');
  });

  it('counts every match but returns at most the limit', () => {
    const result = searchAideMaterialText('ab '.repeat(50), 'ab', 3);
    expect(result.total).toBe(50);
    expect(result.matches.map((match) => match.from)).toEqual([0, 3, 6]);
  });

  it('finds nothing for an empty query', () => {
    expect(searchAideMaterialText('text', '  ')).toEqual({ matches: [], total: 0 });
  });
});
