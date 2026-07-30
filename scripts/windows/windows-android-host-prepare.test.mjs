// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { prepareWindowsAndroidDebugHost } from './windows-android-host-prepare.mjs';
import { WINDOWS_A5_LIVE_RELOAD_URL } from './windows-a5-live-reload-server.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-host-'));
  roots.push(repoRoot);
  return {
    repoRoot, systemNode: path.join(repoRoot, 'node.exe'),
    systemNpmCli: path.join(repoRoot, 'npm-cli.js')
  };
}

it('builds companion Web, syncs Capacitor with DEV config, and verifies generated identity', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (command, args, options) => {
    calls.push({ args, command, options });
    if (args.includes('sync')) {
      const assets = path.join(paths.repoRoot, 'android', 'app', 'src', 'main', 'assets');
      fs.mkdirSync(path.join(assets, 'public'), { recursive: true });
      fs.writeFileSync(path.join(assets, 'public', 'index.html'), '<main>ready</main>');
      fs.writeFileSync(path.join(assets, 'capacitor.config.json'), JSON.stringify({
        server: { cleartext: true, url: WINDOWS_A5_LIVE_RELOAD_URL }
      }));
    }
    return { code: 0, lines: [], output: 'ok\n', stderr: '', stdout: 'ok\n' };
  });
  await expect(prepareWindowsAndroidDebugHost({ execute, paths })).resolves.toBe('ok\nok\n');
  expect(calls[0]).toMatchObject({
    args: [paths.systemNpmCli, 'run', 'android:web:build'], command: paths.systemNode
  });
  expect(calls[1].args.slice(-2)).toEqual(['sync', 'android']);
  expect(calls[1].options.env.FOLIOLE_ANDROID_DEV_LIVE_RELOAD).toBe('1');
  expect(calls.map(({ args }) => args.join(' ')).join('\n')).not.toMatch(/gradle|install/iu);
});

it('fails closed when sync leaves stale Android assets', async () => {
  const paths = fixture();
  const execute = vi.fn(async () => ({ code: 0, lines: [], output: '', stderr: '', stdout: '' }));
  await expect(prepareWindowsAndroidDebugHost({ execute, paths }))
    .rejects.toMatchObject({ stage: 'android-cap-sync' });
});
