// @vitest-environment node

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { dispatchWindowsAndroidLab } from './windows-android-lab-dispatcher.mjs';
import { WINDOWS_ANDROID_LAB_INSTALLED_FILES } from './windows-android-lab-runtime-manifest.mjs';
import { androidLabPaths, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function prepareSelfcheck(paths) {
  fs.mkdirSync(paths.root, { recursive: true });
  for (const file of WINDOWS_ANDROID_LAB_INSTALLED_FILES) {
    fs.writeFileSync(path.join(paths.root, file), `// ${file}\nANDROID_WINDOWS_DEPENDENCY_REFRESH: 'auto'\n`);
  }
  const signing = Buffer.from('private signing bytes');
  fs.mkdirSync(paths.signingHome, { recursive: true });
  fs.writeFileSync(paths.signingKeystore, signing);
  writeJsonAtomic(paths.config, {
    androidDebugKeystoreSha256: createHash('sha256').update(signing).digest('hex'),
    deviceIdentity: 'A5-STABLE', gitPath: 'git.exe', nodeDirectory: 'C:\\Node', schemaVersion: 2
  });
  writeJsonAtomic(paths.device, { endpoint: '192.168.0.107:43079', identity: '87a33a4b', schemaVersion: 1 });
  fs.mkdirSync(paths.evidence, { recursive: true });
}

describe('Windows Android Lab selfcheck', () => {
  it('checks the fixed dispatcher surface without claiming or starting the worker', async () => {
    const paths = androidLabPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-selfcheck-')));
    roots.push(paths.root);
    prepareSelfcheck(paths);
    const calls = [];
    const result = await dispatchWindowsAndroidLab({
      argv: ['selfcheck'], paths,
      runCommand: (command, args) => {
        calls.push([command, args]);
        if (command === 'schtasks.exe') {
          return { code: 0, output: 'Status: Ready\nLast Result: 0\nTask To Run: C:\\Node\\node.exe worker.mjs\n' };
        }
        return { code: 0, output: '' };
      }
    });
    expect(result).toMatchObject({
      dependencyRefresh: 'auto',
      device: { identity: '87a33a4b', state: 'configured' },
      resultStatus: 'success',
      task: { parsed: { status: 'Ready' }, resultStatus: 'success' },
      workerSyntax: { resultStatus: 'success' }
    });
    expect(calls).toEqual([
      ['schtasks.exe', ['/Query', '/TN', 'FolioleAndroidLab', '/FO', 'LIST', '/V']],
      [path.join('C:\\Node', 'node.exe'), ['--check', path.join(paths.root, 'windows-android-lab-worker.mjs')]]
    ]);
    expect(fs.existsSync(paths.active)).toBe(false);
  });
});
