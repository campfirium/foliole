import { expect, it } from 'vitest';

import { compareSyncIdentityText, compareUtf8Text } from './syncIdentityKeyOrder.js';

function byteOrder(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return Math.sign(a[index]! - b[index]!);
  }
  return Math.sign(a.length - b.length);
}

it('matches UTF-8 bytes for prefixes, scalar boundaries and lone-surrogate replacement', () => {
  const values = ['', 'a', 'ab', '\0', '\x7f', '\u0080', '\u07ff', '\u0800',
    '\ud7ff', '\ud800', '\udfff', '\ue000', '\ufffd', '\uffff', '😀',
    String.fromCodePoint(0x10000), String.fromCodePoint(0x10ffff), '中文', '\ud800a', '\ud800\ud800'];
  for (const left of values) for (const right of values) {
    const expected = byteOrder(left, right);
    expect(compareUtf8Text(left, right)).toBe(expected);
    expect(compareSyncIdentityText(left, right)).toBe(left === right ? 0 : expected || 1);
  }
});

it('matches encoded ordering for deterministic mixed UTF-16 strings', () => {
  let seed = 193;
  const text = () => {
    let result = '';
    for (let index = 0; index < 12; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      result += String.fromCharCode(seed & 0xffff);
    }
    return result;
  };
  for (let index = 0; index < 1000; index += 1) {
    const left = text();
    const right = text();
    expect(compareUtf8Text(left, right)).toBe(byteOrder(left, right));
  }
});
