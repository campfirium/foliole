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

const REQUIRED_CAPABILITIES = [...CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities];

it('rejects peers that cannot preserve External provider identities and retirement', () => {
  const legacy = descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter(value => value !== 'external-device-library-lifecycle-v1') });
  expect(evaluateSyncProtocolCompatibility(legacy)).toMatchObject({
    status: 'incompatible', reason: 'required_capability_missing',
    missing_capabilities: ['external-device-library-lifecycle-v1']
  });
});

it('rejects peers that discard External display paths', () => {
  const legacy = descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter(value => value !== 'external-library-reported-path-v1') });
  expect(evaluateSyncProtocolCompatibility(legacy)).toMatchObject({
    status: 'incompatible', reason: 'required_capability_missing',
    missing_capabilities: ['external-library-reported-path-v1']
  });
});

it('rejects a same-version peer lacking the current request transport', () => {
  const legacy = descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter(value => value !== 'framed-sync-v28') });
  expect(evaluateSyncProtocolCompatibility(legacy)).toMatchObject({
    status: 'incompatible', reason: 'required_capability_missing',
    missing_capabilities: ['framed-sync-v28']
  });
  expect(evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR).status).toBe('compatible');
});

it('rejects peers that cannot retain the whole body and its alternatives', () => {
  const oldPeer = descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter((capability) => capability !== 'topic-text-attachments-v1') });
  expect(evaluateSyncProtocolCompatibility(oldPeer)).toMatchObject({
    status: 'incompatible', reason: 'required_capability_missing',
    missing_capabilities: ['topic-text-attachments-v1']
  });
});

describe('syncProtocolContract', () => {
  it('accepts the exact v28 descriptor and returns a negotiated version', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor())).toEqual({
      missing_capabilities: [],
      negotiated_version: 33,
      reason: null,
      status: 'compatible'
    });
  });

  it.each([
    [undefined, 'protocol_metadata_missing'],
    [{}, 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 2, min_supported_version: 2, version: 2 }), 'protocol_version_unsupported'],
    [descriptor({ max_supported_version: 10, min_supported_version: 10, version: 10 }), 'protocol_version_unsupported'],
    [descriptor({ max_supported_version: 11, min_supported_version: 11, version: 11 }), 'protocol_version_unsupported'],
    [descriptor({ max_supported_version: 15, min_supported_version: 15, version: 15 }), 'protocol_version_unsupported'],
    [descriptor({ max_supported_version: 22, min_supported_version: 22, version: 22 }), 'protocol_version_unsupported'],
    [descriptor({ max_supported_version: 24, min_supported_version: 24, version: 24 }), 'protocol_version_unsupported'],
    [descriptor({ max_supported_version: 30, min_supported_version: 30, version: 30 }), 'protocol_version_unsupported'],
    [descriptor({ version: 2 }), 'protocol_version_unsupported'],
    [descriptor({ min_supported_version: 34 }), 'protocol_metadata_invalid'],
    [descriptor({ max_supported_version: 5, min_supported_version: 5, version: 5 }), 'protocol_version_unsupported']
  ])('rejects %j as %s', (remote, reason) => {
    expect(evaluateSyncProtocolCompatibility(remote)).toMatchObject({ reason, status: 'incompatible' });
  });

  it('rejects old and new generations in both directions before accepting the upgraded peer', () => {
    const old = descriptor({ version: 24, min_supported_version: 24, max_supported_version: 24 });
    expect(evaluateSyncProtocolCompatibility(old)).toMatchObject({ status: 'incompatible' });
    expect(evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR, old))
      .toMatchObject({ status: 'incompatible' });
    expect(evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR))
      .toMatchObject({ status: 'compatible', negotiated_version: 33 });
  });

  it('reports missing required capabilities', () => {
    expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: [] }))).toEqual({
      missing_capabilities: REQUIRED_CAPABILITIES,
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
    expect(hint).toEqual({ max_supported_version: 33, min_supported_version: 33, version: 33 });
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

it('requires the display-name contract as part of the exact v28 generation', () => {
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
    .toMatchObject({ negotiated_version: 33, status: 'compatible' });
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

it('rejects v13 registry peers and peers missing node resource ownership', () => {
  expect(evaluateSyncProtocolCompatibility(descriptor({ version: 13, min_supported_version: 13, max_supported_version: 13 })))
    .toMatchObject({ status: 'incompatible', reason: 'protocol_version_unsupported' });
  expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities
    .filter((value) => value !== 'node-owned-resource-references-v1') })))
    .toMatchObject({ status: 'incompatible', missing_capabilities: ['node-owned-resource-references-v1'] });
});

it('rejects pre-session mobile apps in both discovery directions before a round starts', () => {
  const old = descriptor({ version: 25, min_supported_version: 25, max_supported_version: 25 });
  expect(evaluateSyncProtocolCompatibility(old).status).toBe('incompatible');
  expect(evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR, old, old.capabilities).status)
    .toBe('incompatible');
  expect(evaluateSyncProtocolVersionHint(CURRENT_SYNC_PROTOCOL_DESCRIPTOR, old).status).toBe('incompatible');
});

it('rejects the previous generation and peers without bucket inventory before data exchange', () => {
  expect(evaluateSyncProtocolCompatibility(descriptor({ version: 26, min_supported_version: 26, max_supported_version: 26 })))
    .toMatchObject({ status: 'incompatible', reason: 'protocol_version_unsupported' });
  expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: REQUIRED_CAPABILITIES.filter(value => value !== 'bucket-inventory-v1') })))
    .toMatchObject({ status: 'incompatible', missing_capabilities: ['bucket-inventory-v1'] });
});

it('rejects the previous table-installation protocol and peers without local learning actions', () => {
  expect(evaluateSyncProtocolCompatibility(descriptor({ version: 32, min_supported_version: 32, max_supported_version: 32 })))
    .toMatchObject({ status: 'incompatible', reason: 'protocol_version_unsupported' });
  expect(evaluateSyncProtocolCompatibility(descriptor({ capabilities: REQUIRED_CAPABILITIES.filter(value => value !== 'local-daily-flow-actions-v1') })))
    .toMatchObject({ status: 'incompatible', missing_capabilities: ['local-daily-flow-actions-v1'] });
});
