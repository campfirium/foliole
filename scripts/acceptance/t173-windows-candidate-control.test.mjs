import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  parseT173WindowsCandidateControlArgs, parseT173WindowsCandidateManifest
} from './t173-windows-candidate-control.mjs';

const routeIdentity = 't173-sync-aaaaaaaaaa-12345678-1234-1234-1234-123456789abc';

it('accepts only the explicit sync source ref and registered T173 actions', () => {
  expect(parseT173WindowsCandidateControlArgs([
    'multi-device-sync-c', '--source-ref', 'refs/heads/sync'
  ])).toEqual({ action: 'multi-device-sync-c', sourceRef: 'refs/heads/sync' });
  expect(() => parseT173WindowsCandidateControlArgs([
    'multi-device-sync-c', '--source-ref', 'refs/heads/dev'
  ])).toThrow('arguments are invalid');
});

it('accepts receipts only from the route-bound task-owned Windows root', () => {
  const config = { routeIdentity };
  const valid = `[t173-windows-candidate] action=multi-device-sync-c identity=${routeIdentity} `
    + `manifest=D:\\C\\foliole-sync\\.tmp\\artifacts\\t173-windows-candidate\\${routeIdentity}\\receipt.json\n`;
  expect(parseT173WindowsCandidateManifest(valid, config, 'multi-device-sync-c'))
    .toContain(`/t173-windows-candidate/${routeIdentity}/receipt.json`);
  expect(() => parseT173WindowsCandidateManifest(valid.replace(
    'D:\\C\\foliole-sync', 'D:\\C\\foliole'
  ), config, 'multi-device-sync-c')).toThrow('escaped its task-owned root');
});

it('uses a committed task-owned wrapper and never names the T152 capsule or daily checkout', () => {
  const wrapper = fs.readFileSync('scripts/windows/t173-windows-candidate-action.ps1', 'utf8');
  expect(wrapper).toContain('t173-windows-candidate-action.mjs');
  expect(wrapper).not.toContain('t152-windows');
  expect(wrapper).not.toContain('D:\\C\\foliole"');
});
