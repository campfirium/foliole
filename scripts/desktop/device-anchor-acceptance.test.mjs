import { expect, it } from 'vitest';

import {
  parseAcceptanceOutput,
  verifyDesktopDeviceAnchorAcceptance
} from './device-anchor-acceptance.mjs';

const IDENTITY = {
  canonical_library_path: '/fixture/library/Data/foliole.db',
  contract_version: 1,
  device_anchor: '11111111-1111-4111-8111-111111111111',
  group_id: 'group-t152-device-anchor-acceptance',
  identity_key: '[1,"group-t152-device-anchor-acceptance","11111111-1111-4111-8111-111111111111","/fixture/library/Data/foliole.db"]'
};

it('parses the isolated Electron acceptance marker', () => {
  expect(parseAcceptanceOutput(`noise\nFOLIOLE_DEVICE_IDENTITY_ACCEPTANCE ${JSON.stringify({
    status: 'passed'
  })}\n`)).toEqual({ status: 'passed' });
});

it('requires DEV and signed package to share one anchor and one Device', () => {
  const development = { anchor_file: '/group/device-anchor', identity: IDENTITY, status: 'passed' };
  const packaged = { anchor_file: '/group/device-anchor', identity: { ...IDENTITY }, status: 'passed' };

  expect(verifyDesktopDeviceAnchorAcceptance(development, packaged)).toEqual({
    moved_identity_key: expect.stringContaining('foliole.db.copy'),
    other_device_identity_key: expect.stringContaining('22222222-2222-4222-8222-222222222222')
  });
});

it('rejects channel-local anchors', () => {
  expect(() => verifyDesktopDeviceAnchorAcceptance(
    { anchor_file: '/group/dev', identity: IDENTITY, status: 'passed' },
    { anchor_file: '/group/package', identity: IDENTITY, status: 'passed' }
  )).toThrow('did not resolve one Device');
});
