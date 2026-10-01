// @vitest-environment node
/* global process */

import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import installAppImageSandboxLauncher from './appimage-after-pack.mjs';

it('refuses the builder fallback and starts Electron only after a sandbox probe', async () => {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-appimage-'));
  const stubDir = path.join(appOutDir, 'stubs');
  await mkdir(stubDir);
  await writeFile(path.join(appOutDir, 'foliole'), '#!/bin/sh\necho runtime:$*\n');
  await chmod(path.join(appOutDir, 'foliole'), 0o755);
  await installAppImageSandboxLauncher({
    appOutDir, electronPlatformName: 'linux', packager: { executableName: 'foliole' }
  });
  expect((await readFile(path.join(appOutDir, 'foliole'), 'utf8'))).toContain('unshare -Ur true');
  await writeFile(path.join(stubDir, 'zenity'), '#!/bin/sh\nexit 0\n');
  await writeFile(path.join(stubDir, 'unshare'), '#!/bin/sh\nexit "${UNSHARE_RESULT:-0}"\n');
  await Promise.all(['zenity', 'unshare'].map((name) => chmod(path.join(stubDir, name), 0o755)));
  const launch = (args, result = '0') => spawnSync(path.join(appOutDir, 'foliole'), args, {
    encoding: 'utf8', env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, UNSHARE_RESULT: result }
  });
  expect(launch(['--no-sandbox']).status).toBe(1);
  expect(launch(['example'], '1').status).toBe(1);
  const allowed = launch(['example']);
  expect(allowed.status).toBe(0);
  expect(allowed.stdout).toContain('runtime:example');
});
