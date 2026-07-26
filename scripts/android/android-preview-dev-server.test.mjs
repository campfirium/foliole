// @vitest-environment node
/* global process */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEV_SERVER_PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'android-preview-dev-server.sh');
const DEV_SERVER_SYNC_PS_SCRIPT = path.join(REPO_ROOT, 'scripts', 'android', 'windows-cap-sync-dev-server.ps1');

function bashPath(windowsPath) {
  return windowsPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}

async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
  await chmod(fullPath, 0o755);
  return fullPath;
}

function runDevServerPreview(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', 'source "$1"; run_android_preview_dev_server', 'bash', DEV_SERVER_PREVIEW_SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ...env
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

describe('android dev-server preview scripts', () => {
  it('refuses the public entry on Darwin before starting Windows tooling', async () => {
    if (process.platform !== 'darwin') return;

    const result = await new Promise((resolve) => {
      const child = spawn('bash', [DEV_SERVER_PREVIEW_SCRIPT], { cwd: REPO_ROOT });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => resolve({ code, stderr }));
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('windows-android-lab-control.mjs');
  });

  it('orchestrates dev service, mirror sync, Capacitor dev sync, deploy, and adb reverse launch', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'android-dev-preview-'));
    try {
      const mockBinDir = path.join(tempRoot, 'bin');
      const powershellArgsLog = path.join(tempRoot, 'powershell-args.log');
      await mkdir(mockBinDir, { recursive: true });
      await writeExecutable(tempRoot, 'source-sync.sh', '#!/usr/bin/env bash\necho source-sync:${ANDROID_WINDOWS_WORKDIR}\n');
      await writeFile(path.join(tempRoot, 'dev-service.mjs'), 'console.log(`dev-service:${process.argv.slice(2).join(":")}`);\n', 'utf8');
      await writeExecutable(tempRoot, 'deploy.sh', '#!/usr/bin/env bash\necho deploy:${ANDROID_WINDOWS_WORKDIR}:${FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY}:${ANDROID_GRADLE_STOP_AFTER_DEPLOY}:${FOLIOLE_ANDROID_SERIAL-unset}\n');
      await writeExecutable(
        mockBinDir,
        'powershell.exe',
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'printf "%s\\n" "$@" >> "${POWERSHELL_ARGS_LOG}"', 'echo powershell:$*'].join('\n')
      );
      await writeExecutable(
        mockBinDir,
        'wslpath',
        ['#!/usr/bin/env bash', 'set -euo pipefail', 'if [[ "$1" == "-w" ]]; then echo "$2"; else echo "$2"; fi'].join('\n')
      );

      const result = await runDevServerPreview(tempRoot, {
        PATH: `${bashPath(mockBinDir)}:/usr/bin:/bin:${process.env.PATH ?? ''}`,
        ANDROID_DEV_SERVER_START_SCRIPT: path.join(tempRoot, 'dev-service.mjs'),
        ANDROID_SOURCE_SYNC_SCRIPT: path.join(tempRoot, 'source-sync.sh'),
        ANDROID_DEV_SERVER_SYNC_SCRIPT: path.join(tempRoot, 'windows-cap-sync-dev-server.ps1'),
        ANDROID_DEPLOY_SCRIPT: path.join(tempRoot, 'deploy.sh'),
        ANDROID_DEV_SERVER_LAUNCH_SCRIPT: path.join(tempRoot, 'windows-dev-server-launch.ps1'),
        ANDROID_WINDOWS_WORKDIR: 'C:\\dev\\foliole-test',
        ANDROID_DEV_SERVER_URL: 'http://127.0.0.1:24604',
        ANDROID_DEV_SERVER_PORT: '24604',
        FOLIOLE_ANDROID_SERIAL: 'phone-serial',
        POWERSHELL_ARGS_LOG: bashPath(powershellArgsLog)
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-dev-server-preview] step 1/5: start companion dev server');
      expect(result.stdout).toContain('dev-service:start:companion');
      expect(result.stdout).toContain('source-sync:C:\\dev\\foliole-test');
      expect(result.stdout).toContain('deploy:C:\\dev\\foliole-test:1:1:phone-serial');
      expect(result.stdout).toContain('[android-dev-server-preview] status: OPENED');
      const args = await readFile(powershellArgsLog, 'utf8');
      expect(args).toContain('windows-cap-sync-dev-server.ps1');
      expect(args).toContain('-ServerUrl');
      expect(args).toContain('http://127.0.0.1:24604');
      expect(args).toContain('windows-dev-server-launch.ps1');
      expect(args).toContain('-DevServerPort');
      expect(args).toContain('24604');
      expect(args).toContain('-TargetSerial');
      expect(args).toContain('phone-serial');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('keeps the repository Capacitor config clean and syncs server.url only into Android assets', async () => {
    const script = await readFile(DEV_SERVER_SYNC_PS_SCRIPT, 'utf8');

    expect(script).toContain("Copy-Item -Path $configPath -Destination $backupPath -Force");
    expect(script).toContain("Write-DevServerConfig -ConfigPath $configPath -Url $ServerUrl");
    expect(script).toContain('Invoke-NodeTool -Arguments @($capCliPath, "sync", "android")');
    expect(script).toContain('$synced.server.url -ne $ServerUrl');
    expect(script).toContain('Copy-Item -Path $backupPath -Destination $configPath -Force');
    expect(script).toContain('cleartext: true');
  });
});
