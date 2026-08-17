import path from 'node:path';
import { expect, it, vi } from 'vitest';

import {
  stopWindowsDevCandidateRuntime, windowsDevNativeClientStopSpec
} from './windows-dev-candidate-runtime-control.mjs';

const host = 'zephu@192.168.0.11';
const home = '/Users/dev';
const key = path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');

it('targets only the repository-owned native client stop action', () => {
  const spec = windowsDevNativeClientStopSpec(host, {}, home);
  expect(spec).toContain(key);
  expect(spec).toContain('C:/Progra~1/nodejs/node.exe');
  expect(spec).toContain(
    'D:/C/foliole/scripts/windows/windows-client-native.mjs'
  );
  expect(spec.at(-1)).toBe('stop');
});

it('completes the owned runtime stop before candidate control continues', async () => {
  const executeSsh = vi.fn(async () => 'stopped\n');
  const stdout = { write: vi.fn() };
  await stopWindowsDevCandidateRuntime({ env: {}, executeSsh, host, stdout });
  expect(executeSsh).toHaveBeenCalledOnce();
  expect(stdout.write).toHaveBeenCalledWith('stopped\n');
});
