// @vitest-environment node

import { expect, it } from 'vitest';

import { resolveDesktopDeviceIdentityAcceptance } from './deviceIdentityAcceptance.js';

it('keeps the prepare acceptance path absent from ordinary production launches', () => {
  expect(resolveDesktopDeviceIdentityAcceptance({})).toBeNull();
});

it('accepts only explicit supported Mac channels with task-owned inputs', () => {
  const base = {
    FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE_GROUP_ID: 'group-a',
    FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE_LIBRARY_PATH: '/fixture/foliole.db'
  };
  expect(resolveDesktopDeviceIdentityAcceptance({
    ...base, FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE: 'development'
  })).toEqual({ channel: 'development', groupId: 'group-a', libraryPath: '/fixture/foliole.db' });
  expect(() => resolveDesktopDeviceIdentityAcceptance({
    ...base, FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE: 'production'
  })).toThrow('device_identity_acceptance_channel_invalid');
  expect(() => resolveDesktopDeviceIdentityAcceptance({
    FOLIOLE_DEVICE_IDENTITY_ACCEPTANCE: 'mas'
  })).toThrow('device_identity_acceptance_input_missing');
});
