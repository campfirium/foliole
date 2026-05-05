import { describe, expect, it } from 'vitest';

import {
  appendAnchorBlock,
  extractAnchorBlocks,
  parseAnchorBlock,
  parseAnchorBlocks,
  serializeAnchorBlock,
  stripAnchorBlocks
} from './anchorBlocks';

describe('anchorBlocks', () => {
  it('serializes and parses compact anchor block pairs', () => {
    const block = serializeAnchorBlock({
      id: '12',
      kind: 'highlight'
    });

    expect(block).toBe('<highlight id="12"></highlight>');
    expect(parseAnchorBlock(block)).toEqual({
      id: '12',
      kind: 'highlight'
    });
  });

  it('rejects malformed ids or malformed tag shapes', () => {
    expect(parseAnchorBlock('<highlight id="001"></highlight>')).toBeNull();
    expect(parseAnchorBlock('<highlight></highlight>')).toBeNull();
    expect(parseAnchorBlock('<highlight id="2"></cloze>')).toBeNull();
    expect(parseAnchorBlock('<cloze id="2">x</cloze>')).toBeNull();
    expect(parseAnchorBlock('<highlight id="2"></highlight id="2">')).toBeNull();
  });

  it('extracts ranges from content and strips markup tags', () => {
    const content = 'A<highlight id="1">BC</highlight>D<cloze id="2">EF</cloze>G';
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

  it('flags nested or cross-close structures as invalid', () => {
    const nested = '<highlight id="1">a<cloze id="2">b</cloze>c</highlight>';
    const nestedResult = parseAnchorBlocks(nested);
    expect(nestedResult.blocks).toHaveLength(0);
    expect(nestedResult.invalidTokens.some((token) => token.reason === 'nested-not-allowed')).toBe(true);
    expect(nestedResult.invalidTokens.some((token) => token.reason === 'invalid-close')).toBe(true);

    const crossClose = '<highlight id="1">a</cloze><cloze id="2">b</highlight>';
    const crossResult = parseAnchorBlocks(crossClose);
    expect(crossResult.blocks).toHaveLength(0);
    expect(crossResult.invalidTokens.some((token) => token.reason === 'invalid-close')).toBe(true);
  });

  it('appends block pair with expected newline behavior', () => {
    const payload = {
      id: '3',
      kind: 'cloze' as const
    };

    expect(appendAnchorBlock('', payload)).toBe('<cloze id="3"></cloze>');
    expect(appendAnchorBlock('Body', payload)).toBe('Body\n<cloze id="3"></cloze>');
    expect(appendAnchorBlock('Body\n', payload)).toBe('Body\n<cloze id="3"></cloze>');
  });
});
