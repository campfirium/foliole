import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  parseT173WindowsCandidateControlArgs, parseT173WindowsCandidateManifest
} from './t173-windows-candidate-control.mjs';

const routeIdentity = 't173-sync-aaaaaaaaaa-12345678-1234-1234-1234-123456789abc';

it('accepts only the explicit dev source ref and registered T173 actions', () => {
  for (const action of ['multi-device-sync-a-leave', 'multi-device-sync-a-rejoin',
    'multi-device-sync-c', 'multi-device-sync-from-zero', 'multi-device-sync-participation',
    'two-device-sync-provider']) {
    expect(parseT173WindowsCandidateControlArgs([
      action, '--source-ref', 'refs/heads/dev'
    ])).toEqual({ action, sourceRef: 'refs/heads/dev' });
  }
  expect(() => parseT173WindowsCandidateControlArgs([
    'multi-device-sync-c', '--source-ref', 'refs/heads/sync'
  ])).toThrow('arguments are invalid');
});

it('accepts receipts only from the route-bound task-owned Windows root', () => {
  const config = { routeIdentity };
  const valid = `[t173-windows-candidate] action=multi-device-sync-c identity=${routeIdentity} `
    + `manifest=D:\\C\\foliole\\.tmp\\artifacts\\t173-windows-candidate\\${routeIdentity}\\receipt.json\n`;
  expect(parseT173WindowsCandidateManifest(valid, config, 'multi-device-sync-c'))
    .toContain(`/t173-windows-candidate/${routeIdentity}/receipt.json`);
  expect(() => parseT173WindowsCandidateManifest(valid.replace(
    'D:\\C\\foliole', 'D:\\C\\other'
  ), config, 'multi-device-sync-c')).toThrow('escaped its task-owned root');
});

it('uses a committed task-owned wrapper on the dev checkout', () => {
  const controller = fs.readFileSync('scripts/acceptance/t173-windows-candidate-control.mjs', 'utf8');
  const wrapper = fs.readFileSync('scripts/windows/t173-windows-candidate-action.ps1', 'utf8');
  expect(controller).toContain('`${config.action}-receipt.json`');
  expect(wrapper).toContain('t173-windows-candidate-action.mjs');
  expect(wrapper).not.toContain('t152-windows');
  expect(wrapper).not.toContain('t152-windows');
});
