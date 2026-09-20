import { expect, it } from 'vitest';

import { validateAttachmentManifestRetirement, type RetiringAttachmentRow } from './attachmentManifestRetirement.js';

const id = 'a'.repeat(64);
const base: RetiringAttachmentRow = { id, mime_type: 'image/png', size_bytes: 80,
  blob_hash: id, blob_key: `${id}.png`, blob_mime: 'image/png', blob_size: 80 };

it('preserves missing business metadata from a representable legacy manifest', () => {
  expect(validateAttachmentManifestRetirement([{ ...base, mime_type: null, size_bytes: null }]))
    .toEqual([{ id, mimeType: 'image/png', sizeBytes: 80 }]);
});

it.each([
  { id: null }, { id: 'legacy-id' }, { id: ` ${id}` }, { blob_key: `${id}.jpeg` },
  { blob_hash: 'b'.repeat(64) }, { blob_mime: 'image/jpeg' }, { blob_size: 81 },
  { mime_type: null, blob_mime: null }
])('refuses retirement without losing unrepresentable metadata: %j', (change) => {
  expect(() => validateAttachmentManifestRetirement([{ ...base, ...change }]))
    .toThrow('attachment_manifest_retirement_unrepresentable');
});
