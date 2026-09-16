import { createTestZip } from '../ipc/testZipBuilder.js';

export function invalidImageEpubBytes() {
  return createTestZip([
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content: '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Broken</dc:title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="good" href="good.png" media-type="image/png"/><item id="bad" href="bad.png" media-type="image/png"/></manifest><spine><itemref idref="one"/></spine></package>',
      name: 'OPS/book.opf'
    },
    { content: '<html><head><title>One</title></head><body><h1>One</h1><img src="good.png"/><img src="bad.png"/></body></html>', name: 'OPS/one.xhtml' },
    { content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), name: 'OPS/good.png' },
    { content: 'not-an-image', name: 'OPS/bad.png' }
  ]);
}

export function headingCoverEpubBytes() {
  return createTestZip([
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content: '<?xml version="1.0"?><package version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Cover</dc:title></metadata><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="image" href="cover.png" media-type="image/png"/></manifest><spine><itemref idref="cover"/><itemref idref="chapter"/></spine><guide><reference type="cover" href="cover.xhtml"/></guide></package>',
      name: 'OPS/book.opf'
    },
    { content: '<html><body><h1><img alt="Cover" src="cover.png"/></h1></body></html>', name: 'OPS/cover.xhtml' },
    { content: '<html><body><h1>Chapter</h1><p>Body remains available.</p></body></html>', name: 'OPS/chapter.xhtml' },
    { content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), name: 'OPS/cover.png' }
  ]);
}
