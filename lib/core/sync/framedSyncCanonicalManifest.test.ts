import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalContentId,
  canonicalManifestBytes,
  canonicalTransferId,
  type CanonicalFact,
  type CanonicalManifest
} from './framedSyncCanonicalManifest.js';
import {
  assertFrameLengths,
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from './framedSyncContract.js';
import { assertTransferProposalSummary, requiredBlobHashes } from './framedSyncManifestGraph.js';

const digest = (byte: number) => new Uint8Array(32).fill(byte);

const articleFact: CanonicalFact = {
  blobs: [{ byteLength: 42n, required: true, role: 1, sha256: digest(0x77) }],
  body: [
    { name: 'title', value: { kind: 'string', value: 'A framed article' } },
    { name: 'deleted', value: { kind: 'bool', value: false } },
    { name: 'revision', value: { kind: 'unsigned', value: 7n } }
  ],
  factId: 'version-7',
  globalId: 'node-1',
  kind: 2,
  objectType: 'node',
  sharedStateHash: digest(0x44)
};

const reviewFact: CanonicalFact = {
  blobs: [{ byteLength: 512n, required: false, role: 2, sha256: digest(0x66) }],
  body: [
    { name: 'rating', value: { kind: 'signed', value: -1n } },
    { name: 'note', value: { kind: 'null' } }
  ],
  factId: 'review-3',
  globalId: 'node-1',
  kind: 4,
  objectType: 'review',
  sharedStateHash: digest(0x55)
};

function manifest(facts: readonly CanonicalFact[] = [reviewFact, articleFact]): CanonicalManifest {
  return {
    blobs: [
      { byteLength: 42n, required: true, role: 1, sha256: digest(0x77) },
      { byteLength: 512n, required: false, role: 2, sha256: digest(0x66) }
    ],
    facts
  };
}

function hex(value: Uint8Array) { return Buffer.from(value).toString('hex'); }

describe('framed sync canonical identities', () => {
  it('keeps content identity independent of fact and field input order', async () => {
    const reorderedArticle = { ...articleFact, body: [...articleFact.body].reverse() };
    const first = await canonicalContentId(manifest());
    const second = await canonicalContentId(manifest([reorderedArticle, reviewFact]));
    expect(hex(first)).toBe('d2dca32bfb3f929303143a893241d87c1ed85088c1ca6db8e3230a47b7d9c13c');
    expect(second).toEqual(first);
    const golden = JSON.parse(await readFile(
      path.resolve('lib/core/sync/fixtures/framed-sync-v22-golden.json'), 'utf8'
    )) as { canonical: { manifest_base64: string } };
    expect(Buffer.from(canonicalManifestBytes(manifest())).toString('base64'))
      .toBe(golden.canonical.manifest_base64);
  });

  it('binds transfer identity to both endpoint identities and library epochs', async () => {
    const contentId = await canonicalContentId(manifest());
    const base: FramedSyncContext = {
      groupId: 'group-a', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      receiverDeviceId: 'device-b', receiverLibraryEpoch: 'epoch-b',
      senderDeviceId: 'device-a', senderLibraryEpoch: 'epoch-a'
    };
    const first = await canonicalTransferId(base, contentId);
    const otherReceiver = await canonicalTransferId({ ...base, receiverDeviceId: 'device-c' }, contentId);
    expect(hex(first)).toBe('1f2e3a7a1512d4495ce41664551701547c5c18daede9ab3648318e8bea71775d');
    expect(otherReceiver).not.toEqual(first);
  });

  it('rejects duplicate canonical fields and invalid digest widths', () => {
    expect(() => canonicalManifestBytes(manifest([{ ...articleFact, body: [
      { name: 'same', value: { kind: 'null' } },
      { name: 'same', value: { kind: 'bool', value: true } }
    ] }]))).toThrow('canonical_field_duplicate');
    expect(() => canonicalManifestBytes({ ...manifest(), blobs: [
      { byteLength: 1n, required: true, role: 1, sha256: new Uint8Array(31) }
    ] })).toThrow('blob_hash_must_be_32_bytes');
  });

  it('binds each required blob to its owning fact', async () => {
    const moved = [
      { ...articleFact, blobs: [] },
      { ...reviewFact, blobs: [...reviewFact.blobs, ...articleFact.blobs] }
    ];
    expect(await canonicalContentId(manifest(moved))).not.toEqual(await canonicalContentId(manifest()));
  });

  it('rejects duplicate identities, hashes, and malformed Unicode', () => {
    const [firstBlob] = manifest().blobs;
    if (!firstBlob) throw new Error('test_blob_missing');
    expect(() => canonicalManifestBytes(manifest([articleFact, articleFact])))
      .toThrow('canonical_fact_duplicate');
    expect(() => canonicalManifestBytes({ ...manifest(), blobs: [firstBlob, firstBlob] }))
      .toThrow('canonical_blob_duplicate');
    expect(() => canonicalManifestBytes(manifest([{ ...articleFact, globalId: String.fromCharCode(0xd800) }])))
      .toThrow('canonical_unicode_invalid');
  });
});

describe('framed sync manifest blob graph', () => {
  it('requires fact blob references and top-level descriptors to match exactly', () => {
    expect(() => canonicalManifestBytes({ ...manifest(), facts: [
      { ...articleFact, blobs: [{ ...articleFact.blobs[0]!, byteLength: 41n }] }, reviewFact
    ] })).toThrow('canonical_blob_descriptor_mismatch');
    expect(() => canonicalManifestBytes({ ...manifest(), facts: [articleFact] }))
      .toThrow('canonical_blob_unreferenced');
    expect(() => canonicalManifestBytes({ ...manifest(), facts: [
      articleFact,
      { ...reviewFact, blobs: [{ ...reviewFact.blobs[0]!, sha256: digest(0x99) }] }
    ] })).toThrow('canonical_fact_blob_undeclared');
    expect(() => canonicalManifestBytes({ ...manifest(), facts: [
      { ...articleFact, blobs: [...articleFact.blobs, ...articleFact.blobs] }, reviewFact
    ] })).toThrow('canonical_blob_duplicate');
  });

  it('derives required hashes and verifies proposal blob totals from the manifest', () => {
    expect(requiredBlobHashes(articleFact)).toEqual([articleFact.blobs[0]!.sha256]);
    expect(() => assertTransferProposalSummary(2, manifest().blobs, {
      blobCount: 2n, factCount: 2n, totalBlobBytes: 554n
    })).not.toThrow();
    expect(() => assertTransferProposalSummary(2, manifest().blobs, {
      blobCount: 1n, factCount: 2n, totalBlobBytes: 554n
    })).toThrow('transfer_proposal_summary_mismatch');
    expect(() => assertTransferProposalSummary(2, manifest().blobs, {
      blobCount: 2n, factCount: 2n, totalBlobBytes: 553n
    })).toThrow('transfer_proposal_summary_mismatch');
  });
});

describe('framed sync limits and golden corpus', () => {
  it('rejects lengths before frame allocation or decompression', () => {
    expect(() => assertFrameLengths({
      ciphertextBytes: FRAMED_SYNC_LIMITS.maxCiphertextBodyBytes + 1,
      decompressedBytes: 0
    })).toThrow('wire_frame_limit_exceeded');
    expect(() => assertFrameLengths({
      ciphertextBytes: 1,
      decompressedBytes: FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes + 1
    })).toThrow('decompressed_frame_limit_exceeded');
  });

  it('keeps the shared protobuf corpus versioned and bounded', async () => {
    const raw = await readFile(path.resolve('lib/core/sync/fixtures/framed-sync-v22-golden.json'), 'utf8');
    const corpus: unknown = JSON.parse(raw);
    expect(corpus).toMatchObject({ corpus_version: 1, protocol_version: 22 });
    if (!corpus || typeof corpus !== 'object' || !('messages' in corpus) || !Array.isArray(corpus.messages)) {
      throw new Error('golden_corpus_invalid');
    }
    const names = corpus.messages.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || !('name' in entry)) throw new Error('golden_case_invalid');
      return entry.name;
    });
    expect(names).toHaveLength(18);
    expect(names).toEqual(expect.arrayContaining([
      'handshake', 'inventory-chunk', 'transfer-header', 'fact', 'blob-chunk',
      'transfer-receipt', 'round-receipt', 'transfer-termination', 'protocol-error', 'fact-fragment'
    ]));
  });
});
