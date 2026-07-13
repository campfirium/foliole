// @vitest-environment node

import { expect, it } from 'vitest';

import { parseControlArgs, remoteDevicePaths } from './windows-device-control.mjs';

it('accepts a Windows domain user SSH destination', () => {
  expect(parseControlArgs(['--host', 'family\\tester@192.168.0.20', 'status'], {})).toEqual({
    command: ['status'], host: 'family\\tester@192.168.0.20', output: null
  });
  expect(remoteDevicePaths('family\\tester@192.168.0.20', {}, '/Users/example')).toEqual({
    dispatcher: 'C:/Users/tester/AppData/Local/Foliole/windows-device/windows-device-dispatcher.mjs',
    node: 'C:/Users/tester/AppData/Local/Foliole/windows-device/runtime/node-v22.23.1-win-x64/node.exe',
    sshKey: '/Users/example/.ssh/agent/foliole-windows-device'
  });
});
