import { promises as fs } from 'node:fs';
import path from 'node:path';

import { createTestZip } from '../ipc/testZipBuilder.js';

export async function createMultiChapterBookEpub(tempRoot: string, fileName: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(
    filePath,
    createTestZip([
      { compression: 'store', content: 'application/epub+zip', name: 'mimetype' },
      {
        compression: 'store',
        content:
          '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        name: 'META-INF/container.xml'
      },
      {
        compression: 'store',
        content:
          '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Manual Book</dc:title></metadata><manifest><item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>',
        name: 'OPS/book.opf'
      },
      {
        compression: 'store',
        content:
          '<html><body><h1>Chapter 1</h1><p>First chapter keeps the early remembered quote in place.</p></body></html>',
        name: 'OPS/text/chapter-1.xhtml'
      },
      {
        compression: 'store',
        content:
          '<html><body><h1>Chapter 2</h1><p>Second chapter saves the later insight for a different section.</p></body></html>',
        name: 'OPS/text/chapter-2.xhtml'
      }
    ])
  );
  return filePath;
}

export async function createDegradedMultiChapterBookEpub(tempRoot: string, fileName: string) {
  const filePath = path.join(tempRoot, fileName);
  await fs.writeFile(
    filePath,
    createTestZip([
      { compression: 'store', content: 'application/epub+zip', name: 'mimetype' },
      {
        compression: 'store',
        content:
          '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
        name: 'META-INF/container.xml'
      },
      {
        compression: 'store',
        content:
          '<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Degraded Book</dc:title></metadata><manifest><item id="book" href="text/book.xhtml" media-type="application/xhtml+xml"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="book"/></spine></package>',
        name: 'OPS/book.opf'
      },
      {
        compression: 'store',
        content:
          '<ncx><navMap><navPoint><navLabel><text>Degraded Chapter 1</text></navLabel><content src="text/book.xhtml#chapter-1"/></navPoint><navPoint><navLabel><text>Degraded Chapter 2</text></navLabel><content src="text/book.xhtml#chapter-2"/></navPoint><navPoint><navLabel><text>Missing Chapter</text></navLabel><content src="text/book.xhtml#missing"/></navPoint></navMap></ncx>',
        name: 'OPS/toc.ncx'
      },
      {
        compression: 'store',
        content:
          '<html><body><h1 id="chapter-1">Degraded Chapter 1</h1><p>First degraded chapter remains readable.</p><h1 id="chapter-2">Degraded Chapter 2</h1><p>Second degraded chapter remains readable.</p></body></html>',
        name: 'OPS/text/book.xhtml'
      }
    ])
  );
  return filePath;
}
