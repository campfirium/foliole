import fs from 'node:fs';

import { expect, it } from 'vitest';

it('exposes only generic multi-device sync routes', () => {
  const actions = fs.readFileSync('scripts/windows/windows-sync-group-device-actions.mjs', 'utf8');
  const control = fs.readFileSync('scripts/windows/windows-sync-group-control-router.mjs', 'utf8');
  expect(actions).toContain("options.action === 'multi-device-sync-a-leave'");
  expect(actions).toContain("options.action === 'multi-device-sync-candidate'");
  expect(actions).toContain("options.action === 'multi-device-sync-c'");
  expect(actions).toContain("options.action === 'multi-device-sync-a-rejoin'");
  expect(actions).toContain("options.action === 'multi-device-sync-participation'");
  expect(actions).toContain("options.action === 'multi-device-sync-from-zero'");
  expect(`${actions}\n${control}`).not.toMatch(/sync-group-(?:task3|recover|baseline)/u);
});
