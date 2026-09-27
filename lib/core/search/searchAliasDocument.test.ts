import { describe, expect, it } from 'vitest';

import { parseSearchAliasDocument } from './searchAliasDocument.js';

describe('search alias document', () => {
  it('preserves editable text while parsing groups across BOM and CRLF', () => {
    const parsed = parseSearchAliasDocument('\uFEFF# names\r\nDisney | 迪士尼 | disney\r\n\r\nOpenAI | 开放人工智能\r\n');
    expect(parsed.text).toBe('# names\nDisney | 迪士尼 | disney\n\nOpenAI | 开放人工智能\n');
    expect(parsed.groups).toEqual([['Disney', '迪士尼'], ['OpenAI', '开放人工智能']]);
  });

  it('rejects incomplete or conflicting groups with the source line', () => {
    expect(() => parseSearchAliasDocument('Disney |')).toThrow('Line 1');
    expect(() => parseSearchAliasDocument('Disney | 迪士尼\nDISNEY | 米老鼠'))
      .toThrow('Line 2: Spelling already belongs to line 1.');
  });

  it('accepts a deliberately emptied file as an empty table', () => {
    expect(parseSearchAliasDocument('').groups).toEqual([]);
  });
});
