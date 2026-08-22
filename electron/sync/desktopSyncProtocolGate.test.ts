import { expect, it } from 'vitest';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  serializeSyncProtocolTxt
} from '../../lib/platform/syncProtocolContract.js';

import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';

it('accepts only the current protocol generation from discovery', () => {
  expect(evaluateDiscoveredSyncProtocol(serializeSyncProtocolTxt()))
    .toMatchObject({ negotiated_version: 3, status: 'compatible' });
  expect(evaluateDiscoveredSyncProtocol(serializeSyncProtocolTxt({
    ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    max_supported_version: 2,
    min_supported_version: 2,
    version: 2
  }))).toMatchObject({ reason: 'protocol_version_unsupported', status: 'incompatible' });
  expect(evaluateDiscoveredSyncProtocol({}))
    .toMatchObject({ reason: 'protocol_metadata_missing', status: 'incompatible' });
});
