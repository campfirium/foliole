import fs from 'node:fs';

import { expect, it } from 'vitest';

it('retires T121 routes and exposes only the generic candidate preparation action', () => {
  const actions = fs.readFileSync('scripts/windows/windows-sync-group-device-actions.mjs', 'utf8');
  const control = fs.readFileSync('scripts/windows/windows-sync-group-control-router.mjs', 'utf8');
  expect(actions).toContain("options.action === 'multi-device-sync-candidate'");
  expect(`${actions}\n${control}`).not.toMatch(/sync-group-(?:task3|recover|baseline)/u);
});
