// @vitest-environment node

import { expect, it } from 'vitest';

import { parseDeviceCommand, safeEvidencePath, taskIdentity } from './windows-device-state.mjs';

it('parses only the fixed device action grammar', () => {
  expect(parseDeviceCommand('deploy 28875057319 97b1c11e0e3579e41f2fe028a84aea83596b53cf')).toEqual({
    action: 'deploy', commitSha: '97b1c11e0e3579e41f2fe028a84aea83596b53cf', runId: '28875057319'
  });
  expect(parseDeviceCommand('collect get screenshots/result.png')).toMatchObject({ operation: 'get' });
  expect(() => parseDeviceCommand('deploy 1 abc;whoami')).toThrow('commit-sha');
  expect(() => parseDeviceCommand('shell whoami')).toThrow('unsupported');
});

it('keeps task identity stable and evidence inside its root', () => {
  const request = { commitSha: 'a'.repeat(40), runId: '10' };
  expect(taskIdentity(request)).toBe(`${'a'.repeat(40)}:10`);
  expect(safeEvidencePath('/tmp/evidence', 'screenshots/a.png')).toBe('/tmp/evidence/screenshots/a.png');
  expect(() => safeEvidencePath('/tmp/evidence', '../secret')).toThrow('escapes');
});
