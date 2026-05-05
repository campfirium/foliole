import { describe, expect, it } from 'vitest';

import {
  appendAnchorBlock,
  extractAnchorBlocks,
  parseAnchorBlock,
  parseAnchorBlocks,
  serializeAnchorBlock,
  stripAnchorBlocks
} from './anchorBlocks';

describe('anchorBlocks parse', () => {
  it('serializes and parses compact anchor block pairs', () => {
    const block = serializeAnchorBlock({
      id: '12',
      kind: 'highlight'
    });

    expect(block).toBe('<highlight id="12"></highlight id="12">');
    expect(parseAnchorBlock(block)).toEqual({
      id: '12',
      kind: 'highlight'
    });
  });

  it('rejects malformed ids or malformed tag shapes', () => {
    expect(parseAnchorBlock('<highlight id="001"></highlight id="001">')).toBeNull();
    expect(parseAnchorBlock('<highlight></highlight id="1">')).toBeNull();
    expect(parseAnchorBlock('<highlight id="2"></cloze id="2">')).toBeNull();
    expect(parseAnchorBlock('<cloze id="2">x</cloze id="2">')).toBeNull();
    expect(parseAnchorBlock('<highlight id="2"></highlight id="3">')).toBeNull();
  });

  it('extracts ranges from content and strips markup tags', () => {
    const content = 'A<highlight id="1">BC</highlight id="1">D<cloze id="2">EF</cloze id="2">G';
    const blocks = extractAnchorBlocks(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.kind).toBe('highlight');
    expect(blocks[0]?.id).toBe('1');
    expect(content.slice(blocks[0]!.contentFrom, blocks[0]!.contentTo)).toBe('BC');
    expect(blocks[1]?.kind).toBe('cloze');
    expect(blocks[1]?.id).toBe('2');
    expect(content.slice(blocks[1]!.contentFrom, blocks[1]!.contentTo)).toBe('EF');
    expect(stripAnchorBlocks(content)).toBe('ABCDEFG');
  });

  it('supports overlapping anchors by explicit close-id matching', () => {
    const content = 'X<highlight id="1">12<cloze id="2">34</highlight id="1">56</cloze id="2">Y';
    const result = parseAnchorBlocks(content);
    expect(result.invalidTokens).toHaveLength(0);
    expect(result.blocks).toHaveLength(2);

    const highlightBlock = result.blocks.find((block) => block.kind === 'highlight' && block.id === '1');
    const clozeBlock = result.blocks.find((block) => block.kind === 'cloze' && block.id === '2');
    expect(highlightBlock).toBeDefined();
    expect(clozeBlock).toBeDefined();
    expect(content.slice(highlightBlock!.contentFrom, highlightBlock!.contentTo)).toBe('12<cloze id="2">34');
    expect(content.slice(clozeBlock!.contentFrom, clozeBlock!.contentTo)).toBe('34</highlight id="1">56');
  });

  it('flags mismatched close ids and duplicate open ids as invalid', () => {
    const mismatched = '<highlight id="1">a</highlight id="2">';
    const mismatchedResult = parseAnchorBlocks(mismatched);
    expect(mismatchedResult.invalidTokens.some((token) => token.reason === 'invalid-close')).toBe(true);
    expect(mismatchedResult.invalidTokens.some((token) => token.reason === 'unclosed-open')).toBe(true);

    const duplicateOpen = '<highlight id="1">a<highlight id="1">b</highlight id="1">';
    const duplicateResult = parseAnchorBlocks(duplicateOpen);
    expect(duplicateResult.invalidTokens.some((token) => token.reason === 'duplicate-open')).toBe(true);
  });

});

describe('anchorBlocks append', () => {
  it('appends block pair with expected newline behavior', () => {
    const payload = {
      id: '3',
      kind: 'cloze' as const
    };

    expect(appendAnchorBlock('', payload)).toBe('<cloze id="3"></cloze id="3">');
    expect(appendAnchorBlock('Body', payload)).toBe('Body\n<cloze id="3"></cloze id="3">');
    expect(appendAnchorBlock('Body\n', payload)).toBe('Body\n<cloze id="3"></cloze id="3">');
  });
});
