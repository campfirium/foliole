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
  it('accepts the exact v3 descriptor and returns a negotiated version', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor())).toEqual({
      missing_capabilities: [],
      negotiated_version: 3,
      reason: null,
      status: 'compatible'
    });
  });

  it.each([
    [undefined, 'protocol_metadata_missing'],
    [{}, 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 2, min_supported_version: 2, version: 2 }), 'protocol_version_unsupported'],
    [descriptor({ version: 2 }), 'protocol_version_unsupported'],
    [descriptor({ min_supported_version: 4 }), 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 4, min_supported_version: 4, version: 4 }), 'protocol_version_unsupported']
  ])('rejects %j as %s', (remote, reason) => {
    expect(evaluateSyncProtocolCompatibility(remote)).toMatchObject({ reason, status: 'incompatible' });
  });

  it('reports missing required capabilities', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: [] }))).toEqual({
      missing_capabilities: [
        'author-host-snapshots-v1', 'authorization-credential-routing-v1',
        'authorization-delivery-receipts-v1',
        'host-workgroup-members-v1', 'lan-sync-v1', 'opaque-sync-refs-v1',
        'source-host-ownership-v1', 'sync-group-facts-v1',
        'system-entry-display-names-v1', 'workgroup-aead-v1'
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
    expect(hint).toEqual({ max_supported_version: 3, min_supported_version: 3, version: 3 });
    expect(evaluateSyncProtocolVersionHint(hint)).toMatchObject({ status: 'compatible' });
    expect(syncProtocolVersionHintMatchesDescriptor(hint, CURRENT_SYNC_PROTOCOL_DESCRIPTOR)).toBe(true);
  });

  it('rejects malformed descriptors rather than repairing them', () => {
    expect(parseSyncProtocolDescriptor({
      capabilities: [''],
      max_supported_version: 3,
      min_supported_version: 3,
      version: 3
    })).toBeNull();
  });
});

it('requires the display-name contract as part of the exact v3 generation', () => {
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
    .toMatchObject({ negotiated_version: 3, status: 'compatible' });
});
