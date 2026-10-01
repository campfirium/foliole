import { expect, it } from 'vitest';

import { parseNodeResourceReferences, serializeNodeResourceReferences, upsertNodeResourceReference } from './nodeResourceReferences.js';

const png = `${'a'.repeat(64)}.png`;
const pdf = `${'b'.repeat(64)}.pdf`;

it('retains separate node names for shared bytes while excluding local possession facts', () => {
  const value = serializeNodeResourceReferences([
    { storage_key: pdf, role: 'reference', original_name: 'Original.pdf' },
    { storage_key: png, role: 'image', original_name: 'Photo.png' }
  ]);
  expect(parseNodeResourceReferences(value)).toEqual([
    { storage_key: png, role: 'image', original_name: 'Photo.png' },
    { storage_key: pdf, role: 'reference', original_name: 'Original.pdf' }
  ]);
  expect(upsertNodeResourceReference(value, {
    storage_key: png, role: 'image', original_name: 'Renamed.png'
  })).toContain('Renamed.png');
  const local = { storage_key: png, role: 'image' as const, original_name: 'Photo.png',
    size_bytes: 10, availability: 'missing' };
  expect(serializeNodeResourceReferences([local]))
    .toBe(JSON.stringify([{ storage_key: png, role: 'image', original_name: 'Photo.png' }]));
});

it.each(['../image.png', `${'a'.repeat(64)}.jpeg`, `${'a'.repeat(64)}.png `])(
  'rejects an invalid storage key %s', (storage_key) => {
    expect(() => serializeNodeResourceReferences([{ storage_key, role: 'reference', original_name: null }])).toThrow();
  }
);

it('rejects duplicate business references rather than choosing a filename silently', () => {
  expect(() => serializeNodeResourceReferences([
    { storage_key: png, role: 'image', original_name: 'First.png' },
    { storage_key: png, role: 'image', original_name: 'Second.png' }
  ])).toThrow('node_resource_reference_duplicate');
});
