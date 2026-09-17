import { expect, it } from 'vitest';

import {
  windowsSyncGroupCommand, windowsSyncGroupTargetRef
} from './multi-device-sync-windows-command.mjs';

it('routes sync candidates through the T173 task-owned controller', () => {
  expect(windowsSyncGroupTargetRef('refs/heads/sync')).toBe('refs/heads/sync');
  for (const action of ['multi-device-sync-c', 'multi-device-sync-a-rejoin',
    'multi-device-sync-a-leave', 'multi-device-sync-participation',
    'multi-device-sync-from-zero']) {
    expect(windowsSyncGroupCommand(action, 'refs/heads/sync')).toEqual([
      'scripts/acceptance/t173-windows-candidate-control.mjs',
      action, '--source-ref', 'refs/heads/sync'
    ]);
  }
});

it('keeps dev on its existing controller and rejects unowned refs', () => {
  expect(windowsSyncGroupTargetRef()).toBe('refs/heads/dev');
  expect(windowsSyncGroupCommand('multi-device-sync-c')).toEqual([
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-c'
  ]);
  expect(() => windowsSyncGroupCommand('multi-device-sync-c', 'refs/heads/release'))
    .toThrow('No Windows acceptance route owns');
});
