import { describe, expect, it } from 'vitest';

import { extractImportedAnchorBlocks, stripImportedAnchorMarkup } from '../../lib/core/import/importAnchorMarkup';

describe('importAnchorMarkup', () => {
  it('extracts imported highlight and cloze blocks', () => {
    const content = 'A<highlight id="1">BC</highlight id="1">D<cloze id="2">EF</cloze id="2">G';
    const blocks = extractImportedAnchorBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.kind).toBe('highlight');
    expect(blocks[0]?.id).toBe('1');
    expect(content.slice(blocks[0]!.contentFrom, blocks[0]!.contentTo)).toBe('BC');
    expect(blocks[1]?.kind).toBe('cloze');
    expect(blocks[1]?.id).toBe('2');
    expect(content.slice(blocks[1]!.contentFrom, blocks[1]!.contentTo)).toBe('EF');
  });

  it('supports overlapping imported anchors by matching close ids', () => {
    const content = 'X<highlight id="1">12<cloze id="2">34</highlight id="1">56</cloze id="2">Y';
    const blocks = extractImportedAnchorBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(content.slice(blocks[0]!.contentFrom, blocks[0]!.contentTo)).toContain('12');
    expect(content.slice(blocks[1]!.contentFrom, blocks[1]!.contentTo)).toContain('56');
  });

  it('strips imported anchor tags into plain markdown text', () => {
    expect(
      stripImportedAnchorMarkup('A<highlight id="1">BC</highlight id="1">D<cloze id="2">EF</cloze id="2">G')
    ).toBe('ABCDEFG');
  });
});
