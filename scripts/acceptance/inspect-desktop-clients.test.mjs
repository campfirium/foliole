import { expect, it } from 'vitest';

import { parseDesktopInspectArgs } from './inspect-desktop-clients.mjs';

it('uses the fixed Mac and Windows control endpoints', () => {
  expect(parseDesktopInspectArgs([], '/repo')).toEqual({
    artifactRoot: '/repo/.tmp/artifacts/client-control-inspect',
    clients: [
      { endpoint: 'http://127.0.0.1:19224', name: 'mac' },
      { endpoint: 'http://127.0.0.1:19222', name: 'windows' }
    ]
  });
});

it('rejects non-loopback CDP endpoints', () => {
  expect(() => parseDesktopInspectArgs(['--windows-cdp', 'http://192.168.0.11:9222']))
    .toThrow('loopback');
});
