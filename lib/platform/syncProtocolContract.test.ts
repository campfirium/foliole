import { describe, expect, it } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
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
      missing_capabilities: ['lan-sync-v1', 'opaque-sync-refs-v1', 'sync-group-facts-v1', 'workgroup-aead-v1'],
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
