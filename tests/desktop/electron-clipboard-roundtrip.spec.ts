import { expect, test } from './harness/fixtures';

const CUSTOM_TYPE = 'web application/x-foliole-clipboard-test';
const HTML = '<strong>Foliole clipboard test</strong>';
const TEXT = 'Foliole clipboard test';

test('round-trips Electron 44 clipboard items and restores the system clipboard', async ({ desktopSession }) => {
  const result = await desktopSession.electronApp.evaluate(async ({ ClipboardItem, clipboard }, input) => {
    const originalItems = await clipboard.read();
    const originalPayloads = await Promise.all(originalItems.map(async (item) => {
      const entries = await Promise.all(item.types.map(async (type) => [type, await item.getType(type)] as const));
      return Object.fromEntries(entries);
    }));
    const imageBytes = Uint8Array.from(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    ));

    try {
      await clipboard.write([new ClipboardItem({
        [input.customType]: new Blob([Uint8Array.from([1, 2, 3, 4])]),
        'image/png': new Blob([imageBytes], { type: 'image/png' }),
        'text/html': input.html,
        'text/plain': input.text
      })]);
      const written = await clipboard.read();
      const item = written.find((candidate) => candidate.types.includes(input.customType));
      if (!item) throw new Error('custom clipboard item not found');
      const custom = await item.getType(input.customType);
      const html = await item.getType('text/html');
      const image = await item.getType('image/png');
      if (!(custom instanceof Blob) || !(html instanceof Blob) || !(image instanceof Blob)) {
        throw new Error('clipboard MIME payload was not returned as a Blob');
      }
      return {
        custom: Array.from(new Uint8Array(await custom.arrayBuffer())),
        html: await html.text(),
        imageSize: image.size,
        text: await clipboard.readText(),
        types: item.types
      };
    } finally {
      if (originalPayloads.length === 0) {
        clipboard.clear();
      } else {
        await clipboard.write(originalPayloads.map((payload) => new ClipboardItem(payload)));
      }
    }
  }, { customType: CUSTOM_TYPE, html: HTML, text: TEXT });

  expect(result.types).toEqual(expect.arrayContaining([
    CUSTOM_TYPE,
    'image/png',
    'text/html',
    'text/plain'
  ]));
  expect(result.custom).toEqual([1, 2, 3, 4]);
  expect(result.html).toContain(HTML);
  expect(result.imageSize).toBeGreaterThan(0);
  expect(result.text).toBe(TEXT);
});
