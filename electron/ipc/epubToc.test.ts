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
