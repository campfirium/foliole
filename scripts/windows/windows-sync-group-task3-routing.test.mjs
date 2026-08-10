import fs from 'node:fs';

import { expect, it } from 'vitest';

it('binds both task 3 Windows actions to fixed product controllers before dispatch', () => {
  const actions = fs.readFileSync('scripts/windows/windows-sync-group-device-actions.mjs', 'utf8');
  const control = fs.readFileSync('scripts/windows/windows-sync-group-control-router.mjs', 'utf8');
  const runner = fs.readFileSync('scripts/windows/windows-sync-group-task3-action.mjs', 'utf8');
  expect(actions).toContain("options.action === 'sync-group-task3'");
  expect(actions).toContain("options.action === 'sync-group-task3-protect'");
  expect(control).toContain("'sync-group-task3': runWindowsSyncGroupTask3Control");
  expect(control).toContain("'sync-group-task3-protect': runWindowsSyncGroupTask3ProtectControl");
  expect(runner).toContain('createDesktopSyncGroupJourneyFact');
  expect(runner).toContain('openWindowsSyncGroupSession');
  expect(runner).not.toContain('better-sqlite3');
});
