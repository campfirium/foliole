// @vitest-environment node
/* global process */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEPLOY_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-deploy-app.sh');

function runDeploy(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [DEPLOY_SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ...env,
        PATH: `${cwd}${path.delimiter}${process.env.PATH}`
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

async function writeExecutable(rootDir, name, content) {
  const fullPath = path.join(rootDir, name);
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
  return fullPath;
}

describe('windows-deploy-app.sh', () => {
  it('refuses direct deploy without explicit data-risk confirmation', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-deploy-refuse-'));
    try {
      const result = await runDeploy(tempRoot);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('direct deploy can replace the active Android app package');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns after the Windows deploy script reports the app opened', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-deploy-'));
    try {
      await writeExecutable(
        tempRoot,
        'powershell.exe',
        '#!/usr/bin/env bash\necho "[android-deploy] status: OPENED"\nsleep 30\n'
      );

      const result = await runDeploy(tempRoot, {
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY: '1'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-deploy] status: OPENED');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 10000);

  it('returns the Windows deploy failure code when the app is not opened', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-deploy-fail-'));
    try {
      await writeExecutable(
        tempRoot,
        'powershell.exe',
        '#!/usr/bin/env bash\necho "[android-deploy] failed before open"\nexit 42\n'
      );

      const result = await runDeploy(tempRoot, {
        FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY: '1'
      });

      expect(result.code).toBe(42);
      expect(result.stdout).toContain('[android-deploy] failed before open');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 10000);
});
