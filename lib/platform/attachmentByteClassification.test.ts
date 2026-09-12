import { describe, expect, it } from 'vitest';

import { classifyAttachmentBytes } from './attachmentByteClassification.js';
import { buildCanonicalAttachmentKey } from './canonicalAttachmentKey.js';
import fixture from './fixtures/canonical-attachment-preflight-corpus.json' with { type: 'json' };

describe('canonical attachment preflight corpus', () => {
  it.each(fixture)('positively classifies $name', (entry) => {
    const bytes = 'prefixHex' in entry
      ? Buffer.from(entry.prefixHex as string, 'hex')
      : Buffer.from(entry.prefixText as string, 'utf8');
    expect(classifyAttachmentBytes(bytes)).toBe(entry.expectedKind);
  });

  it('uses one stable canonical key mapping for every host fixture', () => {
    const hash = 'a'.repeat(64);
    const cases: Array<[string, string]> = [
      ['application/epub+zip', `${hash}.epub`],
      ['image/png', `${hash}.png`], ['image/jpeg', `${hash}.jpg`], ['image/gif', `${hash}.gif`],
      ['image/webp', `${hash}.webp`], ['application/pdf', `${hash}.pdf`]
    ];
    expect(cases.map(([mime, expected]) => buildCanonicalAttachmentKey(hash, mime) === expected))
      .toEqual([true, true, true, true, true, true]);
    expect(buildCanonicalAttachmentKey(hash, 'text/html')).toBeNull();
  });

  it('classifies WebP when the RIFF size contains non-UTF8 bytes', () => {
    expect(classifyAttachmentBytes(Buffer.from('52494646e0b000005745425056503820', 'hex'))).toBe('image/webp');
  });
});
