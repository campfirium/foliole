// @vitest-environment node

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { dispatchWindowsAndroidLab } from './windows-android-lab-dispatcher.mjs';
import { androidLabPaths, writeJsonAtomic } from './windows-android-lab-state.mjs';
import { WINDOWS_ANDROID_LAB_RUNTIME_FILES } from './windows-android-lab-runtime-update.mjs';
import { resolveWindowsAndroidLabRuntimeFiles } from './windows-android-lab-runtime-manifest.mjs';

const roots = [];
const SHA = '6'.repeat(40);
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-runtime-update-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  fs.mkdirSync(paths.repository, { recursive: true });
  fs.writeFileSync(path.join(paths.repository, 'HEAD'), 'ref: refs/heads/lab/dev\n');
  fs.writeFileSync(path.join(root, 'git.exe'), 'git');
  fs.mkdirSync(path.join(root, 'node'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node', 'node.exe'), 'node');
  writeJsonAtomic(paths.config, {
    adbPath: 'adb.exe', bashPath: 'bash.exe', deviceIdentity: 'A5-STABLE',
    gitPath: path.join(root, 'git.exe'), javaHome: 'C:\\Java', nodeDirectory: path.join(root, 'node'),
    schemaVersion: 2
  });
  fs.writeFileSync(paths.status, Buffer.alloc(8));
  return paths;
}

describe('Windows Android Lab runtime update recovery', () => {
  it('updates installed runtime files without reading corrupted status JSON', async () => {
    const paths = fixture();
    const calls = [];
    const runCommand = (command, args) => {
      calls.push({ args, command });
      if (args.includes('merge-base')) return { code: 0, output: '' };
      if (args[0] === '--check') return { code: 0, output: '' };
      if (args.includes('show')) {
        const file = String(args.at(-1)).split('/').at(-1);
        return { code: 0, output: `// recovered ${file}\n` };
      }
      throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
    };
    const result = await dispatchWindowsAndroidLab({
      argv: ['runtime', 'update', SHA], paths, runCommand
    });
    expect(result).toMatchObject({
      commitSha: SHA,
      fileCount: WINDOWS_ANDROID_LAB_RUNTIME_FILES.length,
      status: 'updated'
    });
    expect(calls[0].args).toEqual([
      '--git-dir', paths.repository, 'merge-base', '--is-ancestor', SHA, 'refs/heads/lab/dev'
    ]);
    expect(fs.readFileSync(paths.status)).toEqual(Buffer.alloc(8));
    expect(fs.readFileSync(path.join(paths.root, 'windows-android-lab-dispatcher.mjs'), 'utf8'))
      .toContain('recovered windows-android-lab-dispatcher.mjs');
    expect(fs.readFileSync(path.join(paths.root, 'windows-android-lab-runtime-manifest.mjs'), 'utf8'))
      .toContain('recovered windows-android-lab-runtime-manifest.mjs');
    expect(fs.readdirSync(paths.root).some((name) => name.startsWith('.runtime-update-backup-'))).toBe(true);
    expect(result.dispatcherSha256).toBe(createHash('sha256')
      .update(fs.readFileSync(path.join(paths.root, 'windows-android-lab-dispatcher.mjs')))
      .digest('hex'));
  });

  it('rejects commits that are not reachable from the fixed Lab ref', async () => {
    const paths = fixture();
    await expect(dispatchWindowsAndroidLab({
      argv: ['runtime', 'update', SHA], paths,
      runCommand: () => ({ code: 1, output: 'not reachable' })
    })).rejects.toMatchObject({ code: 'commit_not_in_lab_ref' });
  });

  it('derives runtime files from entrypoint imports and retained compatibility files', () => {
    expect(resolveWindowsAndroidLabRuntimeFiles()).toEqual(WINDOWS_ANDROID_LAB_RUNTIME_FILES);
    expect(WINDOWS_ANDROID_LAB_RUNTIME_FILES).toContain('windows-android-lab-runtime-manifest.mjs');
    expect(WINDOWS_ANDROID_LAB_RUNTIME_FILES).toContain('windows-android-lab-review-audit-state.ts');
    expect(WINDOWS_ANDROID_LAB_RUNTIME_FILES).toContain('windows-bounded-process.mjs');
  });

  it('keeps the old runtime installed when staged syntax checks fail', async () => {
    const paths = fixture();
    fs.writeFileSync(path.join(paths.root, 'windows-android-lab-dispatcher.mjs'), '// old dispatcher\n');
    await expect(dispatchWindowsAndroidLab({
      argv: ['runtime', 'update', SHA], paths,
      runCommand: (command, args) => {
        if (args.includes('merge-base')) return { code: 0, output: '' };
        if (args[0] === '--check' && String(args[1]).endsWith('windows-android-lab-worker.mjs')) {
          return { code: 1, output: 'syntax failed' };
        }
        if (args[0] === '--check') return { code: 0, output: '' };
        if (args.includes('show')) return { code: 0, output: '// new runtime\n' };
        throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
      }
    })).rejects.toMatchObject({ code: 'windows-android-lab-worker_syntax_failed' });
    expect(fs.readFileSync(path.join(paths.root, 'windows-android-lab-dispatcher.mjs'), 'utf8'))
      .toBe('// old dispatcher\n');
  });
});
