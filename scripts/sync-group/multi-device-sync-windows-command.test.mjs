import { expect, it } from 'vitest';

import { windowsSyncGroupCommand } from './multi-device-sync-windows-command.mjs';

it('routes sync candidates through the T173 task-owned controller', () => {
  expect(windowsSyncGroupCommand('multi-device-sync-c', 'refs/heads/sync')).toEqual([
    'scripts/acceptance/t173-windows-candidate-control.mjs',
    'multi-device-sync-c', '--source-ref', 'refs/heads/sync'
  ]);
});

it('keeps dev on its existing controller and rejects unowned refs', () => {
  expect(windowsSyncGroupCommand('multi-device-sync-c')).toEqual([
    'scripts/windows/windows-dev-control.mjs', 'multi-device-sync-c'
  ]);
  expect(() => windowsSyncGroupCommand('multi-device-sync-c', 'refs/heads/release'))
    .toThrow('No Windows acceptance route owns');
});
