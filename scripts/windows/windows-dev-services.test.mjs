// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createServiceLaunch, SERVICES } from './windows-dev-services.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('windows dev services', () => {
  it('defines companion and demo as managed long-lived services', () => {
    expect(Object.keys(SERVICES).sort()).toEqual(['companion', 'demo']);
    expect(SERVICES.companion.args).toContain('vite.companion.config.ts');
    expect(SERVICES.demo.args).toContain('vite.demo.config.ts');
  });

  it('launches services hidden with file-backed state and logs', () => {
    const launch = createServiceLaunch('companion', {
      nodePath: 'C:/node/node.exe',
      root: 'D:/repo',
      stateDirectory: 'D:/repo/.tmp/windows-dev-services'
    });

    expect(launch.command).toBe('C:/node/node.exe');
    expect(launch.args).toContain('node_modules/vite/bin/vite.js');
    expect(launch.env.FOLIOLE_VITE_PORT).toBe('24604');
    expect(launch.readyUrl).toBe('http://127.0.0.1:24604/');
    expect(launch.spawnOptions).toMatchObject({
      cwd: 'D:/repo',
      detached: true,
      shell: false,
      windowsHide: true
    });
    expect(launch.paths.state).toBe('D:/repo/.tmp/windows-dev-services/companion.json');
    expect(launch.paths.outLog).toBe('D:/repo/.tmp/windows-dev-services/companion.out.log');
    expect(launch.paths.errLog).toBe('D:/repo/.tmp/windows-dev-services/companion.err.log');
  });

  it('exposes package scripts for controlled service start instead of raw Vite terminals', async () => {
    const packageJson = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));

    expect(packageJson.scripts['windows:dev-service']).toBe('node scripts/windows/windows-dev-services.mjs');
    expect(packageJson.scripts['android:web:dev']).toBe(
      'node scripts/windows/windows-dev-services.mjs start companion'
    );
  });
});
