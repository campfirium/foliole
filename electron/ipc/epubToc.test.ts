import { expect, it } from 'vitest';

import { readEpubToc, type EpubManifestItem } from './epubToc.js';

it('keeps ncx toc href fragments while normalizing paths', () => {
  const manifest = new Map<string, EpubManifestItem>([
    ['ncx', { href: 'OEBPS/toc.ncx', mediaType: 'application/x-dtbncx+xml', properties: [] }]
  ]);
  const entries = new Map<string, Uint8Array>([
    [
      'OEBPS/toc.ncx',
      new TextEncoder().encode(`
        <ncx>
          <navMap>
            <navPoint>
              <navLabel><text>Chapter 1</text></navLabel>
              <content src="text/book.xhtml#chapter-1"/>
            </navPoint>
          </navMap>
        </ncx>
      `)
    ]
  ]);

  expect(readEpubToc({ entries, manifest, opfDirectory: 'OEBPS', opfXml: '<spine toc="ncx" />' })).toEqual([
    {
      children: [],
      href: 'OEBPS/text/book.xhtml#chapter-1',
      title: 'Chapter 1'
    }
  ]);
});

it('keeps a text-only parent label separate from its nested chapter links', () => {
  const manifest = new Map<string, EpubManifestItem>([
    ['nav', { href: 'OPS/nav.xhtml', mediaType: 'application/xhtml+xml', properties: ['nav'] }]
  ]);
  const entries = new Map([['OPS/nav.xhtml', new TextEncoder().encode(
    '<nav epub:type="toc"><ol><li><span>Part One</span><ol><li><a href="one.xhtml">First</a></li><li><a href="two.xhtml">Second</a></li></ol></li></ol></nav>')]]);
  expect(readEpubToc({ entries, manifest, opfDirectory: 'OPS', opfXml: '' })).toEqual([
    { title: 'Part One', href: null, children: [
      { title: 'First', href: 'OPS/one.xhtml', children: [] },
      { title: 'Second', href: 'OPS/two.xhtml', children: [] }
    ] }
  ]);
});
