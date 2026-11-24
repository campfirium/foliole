// @vitest-environment node

import { defaultTreeAdapter } from 'parse5';
import { afterEach, expect, it, vi } from 'vitest';

import { decodeHtmlFile } from './decodeHtmlFile.js';

afterEach(() => vi.restoreAllMocks());

it('decodes a large page with an early declaration without building the trailing DOM', () => {
  const createElement = vi.spyOn(defaultTreeAdapter, 'createElement');
  const original = '<html><head><meta charset=utf-8></head><body>'
    + '<article>A long HTML document with café and 日本.</article>'.repeat(4000)
    + '<footer>End of the document.</footer></body></html>';

  expect(decodeHtmlFile(new TextEncoder().encode(original))).toBe(original);
  expect(createElement.mock.calls.some(([tagName]) => tagName === 'footer')).toBe(false);
});

it('chooses a complete declaration after tokenizer chunks, ignoring inert markup', () => {
  const inert = '<!-- <meta charset=gbk> --><script>"<meta charset=big5>"</script>'
    + '<template><meta charset=shift_jis></template><noscript><meta charset=utf-8></noscript>';
  const prefix = '<html><head>' + inert + '<!--' + 'x'.repeat(9000) + '-->';
  const original = prefix + '<meta content="text/html; charset=windows-1252" HTTP-EQUIV="Content-Type">'
    + '</head><body>café</body></html>';
  expect(decodeHtmlFile(Buffer.from(original, 'latin1'))).toBe(original);
});

it('still uses an active declaration late in the body', () => {
  const original = '<body>' + '<p>Long prelude.</p>'.repeat(2000) + '<meta charset=windows-1252><p>café</p></body>';
  expect(decodeHtmlFile(Buffer.from(original, 'latin1'))).toBe(original);
});

it('keeps a BOM authoritative over metadata and rejects invalid declared UTF-8', () => {
  const original = '<meta charset=gbk><p>日本語</p>';
  expect(decodeHtmlFile(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(original)]))).toBe(`\uFEFF${original}`);
  const invalid = Buffer.concat([Buffer.from('<meta charset=utf-8><p>'), Buffer.from([0xe4, 0xb8])]);
  expect(() => decodeHtmlFile(invalid)).toThrow('declared encoding (utf-8)');
});
