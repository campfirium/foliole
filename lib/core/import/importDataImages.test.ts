import { expect, it } from 'vitest';

import { createPreparedDesktopTextImport } from './fingerprint.js';
import { localizeImportDataImages, UNIMPORTABLE_IMAGE_PLACEHOLDER } from './importDataImages.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=';
const PNG_URL = `data:image/png;base64,${PNG}`;

function prepare(content: string) {
  return createPreparedDesktopTextImport({
    content, degradedReason: null, fileName: 'a.md', filePath: '/a.md',
    importedAt: '2026-11-28T00:00:00.000Z', kind: 'markdown'
  });
}

it('turns inline and percent-encoded data images into one shared attachment', () => {
  const input = prepare(`![One](${PNG_URL} "Title")\n\n![Two](${encodeURIComponent(PNG_URL)})`);
  const { prepared, images } = localizeImportDataImages(input);
  const key = images[0]!.storageKey;
  expect(images).toHaveLength(1);
  expect(prepared.content).toBe(`![One](asset://${key} "Title")\n\n![Two](asset://${key})`);
  expect(prepared.localizedImageResources).toEqual([{ storage_key: key, original_name: 'inline-image.png', role: 'image' }]);
  expect(prepared.contentFingerprint).toBe(input.contentFingerprint);
  expect(prepared.degradedReason).toBeNull();
});

it('leaves code samples untouched', () => {
  const content = `\`![x](${PNG_URL})\`\n\n\`\`\`md\n![y](${PNG_URL})\n\`\`\``;
  const { prepared, images } = localizeImportDataImages(prepare(content));
  expect(images).toEqual([]);
  expect(prepared.content).toBe(content);
});

it('keeps a small unusable image and replaces one that cannot fit in a body part', () => {
  const huge = `![Big](data:image/svg+xml;base64,${'A'.repeat(1_100_000)})`;
  const { prepared, images } = localizeImportDataImages(prepare(`before\n\n![Bad](data:image/png;base64,cG5n)\n\n${huge}\n\nafter`));
  expect(images).toEqual([]);
  expect(prepared.content).toBe(`before\n\n![Bad](data:image/png;base64,cG5n)\n\n${UNIMPORTABLE_IMAGE_PLACEHOLDER}\n\nafter`);
  expect(prepared.degradedReason).toBe('Inline images kept as text data: 1; Inline images could not be imported: 1');
});

it('rewrites highlight text together with the body', () => {
  const input = prepare(`See ![One](${PNG_URL}) here`);
  const highlight = `See ![One](${PNG_URL}) here`;
  const { prepared } = localizeImportDataImages({
    ...input, matchedHighlights: [{ content: highlight, label: null, locatorText: highlight }]
  });
  expect(prepared.matchedHighlights).toEqual([{ content: prepared.content, label: null, locatorText: prepared.content }]);
});
