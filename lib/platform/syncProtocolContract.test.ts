import { describe, expect, it } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
  evaluateSyncProtocolVersionHint,
  parseSyncProtocolDescriptor,
  parseSyncProtocolTxt,
  serializeSyncProtocolTxt,
  syncProtocolVersionHintMatchesDescriptor,
  type SyncProtocolDescriptor
} from './syncProtocolContract.js';

function descriptor(overrides: Partial<SyncProtocolDescriptor> = {}) {
  return { ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR, ...overrides };
}

describe('syncProtocolContract', () => {
  it('accepts the exact v10 descriptor and returns a negotiated version', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor())).toEqual({
      missing_capabilities: [],
      negotiated_version: 10,
      reason: null,
      status: 'compatible'
    });
  });

  it.each([
    [undefined, 'protocol_metadata_missing'],
    [{}, 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 2, min_supported_version: 2, version: 2 }), 'protocol_version_unsupported'],
    [descriptor({ version: 2 }), 'protocol_version_unsupported'],
    [descriptor({ min_supported_version: 11 }), 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 5, min_supported_version: 5, version: 5 }), 'protocol_version_unsupported']
  ])('rejects %j as %s', (remote, reason) => {
    expect(evaluateSyncProtocolCompatibility(remote)).toMatchObject({ reason, status: 'incompatible' });
  });

  it('reports missing required capabilities', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: [] }))).toEqual({
      missing_capabilities: [
        'article-image-sources-v1', 'attachment-metadata-only-v1', 'author-host-snapshots-v1', 'canonical-attachment-storage-key-v1',
        'complete-member-data-plane', 'desktop-soft-anchor-v1', 'device-delivery-receipts-v1',
      'device-sync-groups-v1', 'group-key-routing-v1', 'lan-sync-v1', 'node-tombstone-pack-v1', 'opaque-sync-refs-v1',
      'readwise-library-source-mode-v1',
      'resource-availability-v1',
      'source-host-ownership-v1', 'sync-group-device-facts-v1', 'sync-group-member-state-v1',
        'system-entry-display-names-v1', 'watched-device-binding-v1',
        'watched-source-identity-and-path-v1', 'workgroup-aead-v1'
      ],
      negotiated_version: null,
      reason: 'required_capability_missing',
      status: 'incompatible'
    });
  });

  it('keeps mDNS TXT as a bounded version hint and leaves capabilities to discovery', () => {
    const txt = serializeSyncProtocolTxt();
    const hint = parseSyncProtocolTxt(txt);
    expect(txt).not.toHaveProperty('protocol_capabilities');
    expect(Object.entries(txt).every(([key, value]) => Buffer.byteLength(`${key}=${value}`) <= 255)).toBe(true);
    expect(hint).toEqual({ max_supported_version: 10, min_supported_version: 10, version: 10 });
    expect(evaluateSyncProtocolVersionHint(hint)).toMatchObject({ status: 'compatible' });
    expect(syncProtocolVersionHintMatchesDescriptor(hint, CURRENT_SYNC_PROTOCOL_DESCRIPTOR)).toBe(true);
  });

  it('rejects malformed descriptors rather than repairing them', () => {
    expect(parseSyncProtocolDescriptor({
      capabilities: [''],
      max_supported_version: 8,
      min_supported_version: 8,
      version: 8
    })).toBeNull();
  });
});

it('requires the display-name contract as part of the exact v10 generation', () => {
  const legacyV2 = descriptor({
    max_supported_version: 2,
    min_supported_version: 2,
    version: 2,
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(
      (capability) => capability !== 'system-entry-display-names-v1'
    )
  });
  expect(evaluateSyncProtocolCompatibility(legacyV2)).toMatchObject({
    negotiated_version: null,
    reason: 'protocol_version_unsupported',
    status: 'incompatible'
  });
  expect(evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR))
    .toMatchObject({ negotiated_version: 10, status: 'compatible' });
});

it('rejects peers that cannot preserve article image sources', () => {
  const oldPeer = descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter((capability) => capability !== 'article-image-sources-v1') });
  expect(evaluateSyncProtocolCompatibility(oldPeer)).toMatchObject({
    status: 'incompatible', reason: 'required_capability_missing', missing_capabilities: ['article-image-sources-v1']
  });
});

it('rejects peers that cannot transfer permanent node deletions', () => {
  const oldPeer = descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter((capability) => capability !== 'node-tombstone-pack-v1') });
  expect(evaluateSyncProtocolCompatibility(oldPeer)).toMatchObject({
    status: 'incompatible', reason: 'required_capability_missing', missing_capabilities: ['node-tombstone-pack-v1']
  });
});

it('rejects protocol 7 peers that still require attachment possession manifests', () => {
  expect(evaluateSyncProtocolCompatibility(descriptor({ version: 7, min_supported_version: 7, max_supported_version: 7 })))
    .toMatchObject({ status: 'incompatible', reason: 'protocol_version_unsupported' });
});
