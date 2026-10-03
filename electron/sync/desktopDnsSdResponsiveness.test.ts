// @vitest-environment node
import { spawn } from 'node:child_process';
import path from 'node:path';

import { expect, it } from 'vitest';

// macOS unrefs native callbacks and owns environment-exit cleanup.
const shutdownModes = process.platform === 'darwin' ? ['cancel', 'environment-exit'] : ['cancel'];
it.each(shutdownModes)('keeps HTTP responsive and cleans up native resolutions on %s', async (mode) => {
  const result = await new Promise<{ code: number | null; signal: string | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('electron/sync/desktopDnsSdResponsiveness.fixture.cjs'), mode], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 12_000
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, output }));
  });
  expect(result, result.output).toMatchObject({ code: 0, signal: null });
}, 15_000);
