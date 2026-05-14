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
