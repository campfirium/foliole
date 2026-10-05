import { expect, it } from 'vitest';

import { readFramedSyncNodeResources } from './framedSyncNodeResources.js';

it('maps canonical Node resources to image, PDF, and attachment blob roles', () => {
  const image = '1'.repeat(64);
  const pdf = '2'.repeat(64);
  const attachment = '3'.repeat(64);

  expect(readFramedSyncNodeResources(JSON.stringify([
    { original_name: 'Cover.webp', role: 'image', storage_key: `${image}.webp` },
    { original_name: 'Document.pdf', role: 'reference', storage_key: `${pdf}.pdf` },
    { original_name: 'Book.epub', role: 'reference', storage_key: `${attachment}.epub` }
  ]))).toEqual([
    { contentHash: image, role: 2, storageKey: `${image}.webp` },
    { contentHash: pdf, role: 3, storageKey: `${pdf}.pdf` },
    { contentHash: attachment, role: 4, storageKey: `${attachment}.epub` }
  ]);
});

it('rejects UTF-8 data_text instead of interpreting it as a binary resource reference', () => {
  expect(() => readFramedSyncNodeResources(JSON.stringify({ data_text: 'plain text' })))
    .toThrow('node_resource_references_invalid');
});
