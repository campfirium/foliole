import { describe, expect, it } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
  evaluateSystemEntryDisplayNamesWriteCompatibility,
  parseSyncProtocolDescriptor,
  parseSyncProtocolTxt,
  serializeSyncProtocolTxt,
  syncProtocolDescriptorsMatch,
  type SyncProtocolDescriptor
} from './syncProtocolContract.js';

function descriptor(overrides: Partial<SyncProtocolDescriptor> = {}) {
  return { ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR, ...overrides };
}

describe('syncProtocolContract', () => {
  it('accepts the exact v2 descriptor and returns a negotiated version', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor())).toEqual({
      missing_capabilities: [],
      negotiated_version: 2,
      reason: null,
      status: 'compatible'
    });
  });

  it.each([
    [undefined, 'protocol_metadata_missing'],
    [{}, 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 1, min_supported_version: 1, version: 1 }), 'protocol_version_unsupported'],
    [descriptor({ version: 1 }), 'protocol_version_unsupported'],
    [descriptor({ min_supported_version: 3 }), 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 3, min_supported_version: 3, version: 3 }), 'protocol_version_unsupported']
  ])('rejects %j as %s', (remote, reason) => {
    expect(evaluateSyncProtocolCompatibility(remote)).toMatchObject({ reason, status: 'incompatible' });
  });

  it('reports missing required capabilities', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: [] }))).toEqual({
      missing_capabilities: [
        'author-host-snapshots-v1', 'authorization-credential-routing-v1',
        'authorization-delivery-receipts-v1',
        'host-workgroup-members-v1', 'lan-sync-v1', 'opaque-sync-refs-v1',
        'source-host-ownership-v1', 'sync-group-facts-v1', 'workgroup-aead-v1'
      ],
      negotiated_version: null,
      reason: 'required_capability_missing',
      status: 'incompatible'
    });
  });

  it('normalizes and round-trips the compact mDNS TXT projection', () => {
    const txt = serializeSyncProtocolTxt();
    expect(parseSyncProtocolTxt(txt)).toEqual(CURRENT_SYNC_PROTOCOL_DESCRIPTOR);
    expect(syncProtocolDescriptorsMatch(parseSyncProtocolTxt(txt), CURRENT_SYNC_PROTOCOL_DESCRIPTOR)).toBe(true);
  });

  it('rejects malformed descriptors rather than repairing them', () => {
    expect(parseSyncProtocolDescriptor({
      capabilities: [''],
      max_supported_version: 2,
      min_supported_version: 2,
      version: 2
    })).toBeNull();
  });
});

it('advertises the prepared display-name contract without stopping legacy v2 hosts', () => {
  const legacyV2 = descriptor({
    capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(
      (capability) => capability !== 'system-entry-display-names-v1'
    )
  });
  expect(evaluateSyncProtocolCompatibility(legacyV2)).toMatchObject({ status: 'compatible' });
  expect(evaluateSystemEntryDisplayNamesWriteCompatibility(legacyV2)).toEqual({
    missing_capabilities: ['system-entry-display-names-v1'],
    negotiated_version: null,
    reason: 'required_capability_missing',
    status: 'incompatible'
  });
  expect(evaluateSystemEntryDisplayNamesWriteCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR))
    .toMatchObject({ status: 'compatible' });
});
