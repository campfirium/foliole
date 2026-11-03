import { createTestZip } from '../../electron/ipc/testZipBuilder';

export const EPUB_IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII=', 'base64');
export const EPUB_ICON = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
export function companionEpubBook(images = true, missingSecond = false) {
  const entries: Parameters<typeof createTestZip>[0] = [
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>' },
    { name: 'OPS/book.opf', content: `<package><metadata><dc:title>Pocket Book</dc:title></metadata><manifest>
      <item id="second" href="two.xhtml" media-type="application/xhtml+xml"/>
      <item id="first" href="one.xhtml" media-type="application/xhtml+xml"/>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
      ${images ? '<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>' : ''}
      </manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>` },
    { name: 'OPS/nav.xhtml', content: '<html><body><nav epub:type="toc"><ol><li><span>Part One</span><ol><li><a href="one.xhtml">First section</a></li><li><a href="two.xhtml">Second section</a></li></ol></li></ol></nav></body></html>' },
    { name: 'OPS/one.xhtml', compression: 'deflate', content: `<html><head><title>First section</title></head><body><h1>First section</h1><p>First chapter body.</p>${images ? '<img src="cover.png" alt="Figure"/><img src="icon.gif" alt="Icon"/>' : ''}</body></html>` },
    { name: 'OPS/two.xhtml', compression: 'deflate', content: '<html><head><title>Second section</title></head><body><h1>Second section</h1><p>Second chapter body.</p></body></html>' },
    ...(images ? [{ name: 'OPS/cover.png', content: EPUB_IMAGE, compression: 'deflate' as const }, { name: 'OPS/icon.gif', content: EPUB_ICON }] : [])
  ];
  return createTestZip(entries.filter(entry => !missingSecond || entry.name !== 'OPS/two.xhtml'));
}
