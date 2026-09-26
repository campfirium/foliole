import { expect, it } from 'vitest';

import {
  windowsSyncGroupCommand, windowsSyncGroupTargetRef
} from './multi-device-sync-windows-command.mjs';

it('routes all formal sync candidates through the existing dev controller', () => {
  expect(windowsSyncGroupTargetRef()).toBe('refs/heads/dev');
  expect(windowsSyncGroupCommand('multi-device-sync-c')).toEqual([
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-c'
  ]);
  expect(windowsSyncGroupCommand('multi-device-sync-candidate')).toEqual([
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-candidate',
    '--source-ref', 'refs/heads/dev'
  ]);
  expect(() => windowsSyncGroupCommand('multi-device-sync-c', 'refs/heads/sync'))
    .toThrow('No Windows acceptance route owns');
  expect(() => windowsSyncGroupCommand('multi-device-sync-c', 'refs/heads/release'))
    .toThrow('No Windows acceptance route owns');
});
