// @vitest-environment node
import { expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';

import { hostedPackSemanticDigest } from './ios-hosted-sync-pack-semantics.js';

function projection(table, row) {
  return {
    prepare: (sql) => ({ all: () => sql.endsWith(`."${table}"`) ? [row] : [] })
  };
}

function pdfRow(payloadJson) {
  return {
    object_type: 'pdf_page_text', object_id: 'attachment:1',
    content_hash: computeSyncContentHash('pdf_page_text', JSON.parse(payloadJson)),
    payload_json: payloadJson, updated_at: '2026-09-20T00:00:00Z', deleted_at: null
  };
}

const digest = (row) => hostedPackSemanticDigest(projection('sync_objects', row));

it('compares equivalent PDF JSON numbers under the verified sync content hash', () => {
  const legacy = pdfRow('{"page":1,"page_width":800,"page_height":1200,"text":"body"}');
  const native = pdfRow('{"text":"body","page_height":1200.0,"page_width":800.0,"page":1}');
  expect(digest(native)).toBe(digest(legacy));
});

it('retains differences in PDF content and JSON value types', () => {
  const baseline = digest(pdfRow('{"page_width":800,"text":"body"}'));
  expect(digest(pdfRow('{"page_width":801,"text":"body"}'))).not.toBe(baseline);
  expect(digest(pdfRow('{"page_width":"800","text":"body"}'))).not.toBe(baseline);
  expect(digest(pdfRow('{"page_width":800,"text":"changed"}'))).not.toBe(baseline);
});

it('rejects PDF bytes inconsistent with their advertised content hash', () => {
  const row = pdfRow('{"text":"body"}');
  expect(() => digest({ ...row, payload_json: '{"text":"changed"}' }))
    .toThrow('ios_hosted_oracle_pdf_payload_hash_mismatch');
  expect(() => digest({ ...row, payload_json: '{' })).toThrow();
});

it('preserves tombstone and identity differences', () => {
  const row = pdfRow('{"text":"body"}');
  expect(digest({ ...row, deleted_at: '2026-09-21T00:00:00Z' })).not.toBe(digest(row));
  expect(digest({ ...row, object_id: 'attachment:2' })).not.toBe(digest(row));
});

it('treats only the legacy omitted image sources as null, preserving real sources', () => {
  const legacy = { id: 'node', content: 'body' };
  const baseline = hostedPackSemanticDigest(projection('nodes', legacy));
  expect(hostedPackSemanticDigest(projection('nodes', { ...legacy, image_sources: null }))).toBe(baseline);
  expect(hostedPackSemanticDigest(projection('nodes', { ...legacy, image_sources: '{"image":"source"}' })))
    .not.toBe(baseline);
  expect(hostedPackSemanticDigest(projection('nodes', { ...legacy, unexpected_field: null })))
    .not.toBe(baseline);
});
