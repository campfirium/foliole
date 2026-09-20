import { expect, it } from 'vitest';

import { parseAttachmentMaintenanceRequest } from './attachmentMaintenanceContract.js';

it('accepts explicit maintenance actions and bounded settings', () => {
  expect(parseAttachmentMaintenanceRequest({ action: 'configure', settings: { automatic: false, observationThreshold: 30 } }))
    .toEqual({ action: 'configure', settings: { automatic: false, observationThreshold: 30 } });
  expect(parseAttachmentMaintenanceRequest({ action: 'restore', storageKeys: ['a'.repeat(64) + '.png'] }).action).toBe('restore');
});

it('rejects malformed requests and thresholds before reaching host file operations', () => {
  for (const value of [null, {}, { action: 'delete' }, { action: 'restore', storageKeys: [1] },
    ...[0, -1, 1.5, Infinity, '1'].map((observationThreshold) => ({ action: 'configure', settings: { automatic: true, observationThreshold } })),
    { action: 'configure', settings: { automatic: 'yes', observationThreshold: 1 } }]) {
    expect(() => parseAttachmentMaintenanceRequest(value)).toThrow('request_invalid');
  }
});
