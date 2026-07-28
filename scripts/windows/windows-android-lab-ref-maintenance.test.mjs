// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { dispatchWindowsAndroidLab } from './windows-android-lab-dispatcher.mjs';
import { repairAndroidLabSourceRef } from './windows-android-lab-ref-maintenance.mjs';
import { androidLabPaths, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', input: options.input }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-lab-ref-maintenance-'));
  roots.push(root);
  const source = path.join(root, 'source');
  const paths = androidLabPaths(path.join(root, 'lab'));
  fs.mkdirSync(source, { recursive: true });
  git(source, ['init']);
  git(source, ['config', 'user.email', 'lab@example.test']);
  git(source, ['config', 'user.name', 'Lab Test']);
  fs.writeFileSync(path.join(source, 'marker.txt'), 'formal\n');
  git(source, ['add', 'marker.txt']);
  git(source, ['commit', '-m', 'formal']);
  const formal = git(source, ['rev-parse', 'HEAD']);
  const tree = git(source, ['rev-parse', 'HEAD^{tree}']);
  const scratch = git(source, ['commit-tree', tree, '-m', 'legacy scratch']);
  git(source, ['init', '--bare', paths.repository]);
  git(source, ['push', paths.repository, `${formal}:refs/heads/lab/dev`]);
  git(source, ['push', '--force', paths.repository, `${scratch}:refs/heads/lab/dev`]);
  writeJsonAtomic(paths.config, { deviceIdentity: 'A5-STABLE', gitPath: 'git', schemaVersion: 2 });
  return { formal, paths, scratch };
}

function runGitCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  return { code: result.status ?? 1, output: result.stdout || result.stderr || '' };
}

function repair(paths, formal, scratch) {
  return repairAndroidLabSourceRef({
    command: { expectedOldSha: scratch, targetSha: formal }, config: { gitPath: 'git' }, paths,
    runCommand: runGitCommand
  });
}

describe('Windows Android Lab ref maintenance', () => {
  it('updates only the fixed ref with exact expected-old CAS semantics', () => {
    const { formal, paths, scratch } = fixture();
    expect(repair(paths, formal, scratch)).toMatchObject({ commitSha: formal, ref: 'refs/heads/lab/dev' });
    expect(git(paths.repository, ['rev-parse', 'refs/heads/lab/dev'])).toBe(formal);
    expect(() => repair(paths, scratch, scratch)).toThrow('cannot lock ref');
  });

  it('cannot select another repository or ref and rejects non-commit objects', () => {
    const { formal, paths, scratch } = fixture();
    const outside = { ...paths, repository: path.join(paths.root, 'other.git') };
    let pathError;
    try { repair(outside, formal, scratch); } catch (error) { pathError = error; }
    expect(pathError).toMatchObject({ code: 'lab_maintenance_path_rejected' });
    const blob = git(paths.repository, ['hash-object', '-w', '--stdin'], { input: 'not a commit' });
    let objectError;
    try { repair(paths, blob, scratch); } catch (error) { objectError = error; }
    expect(objectError).toMatchObject({ code: 'lab_maintenance_target_not_commit' });
  });

  it('lets the existing run entry consume the repaired formal commit', async () => {
    const { formal, paths, scratch } = fixture();
    repair(paths, formal, scratch);
    const calls = [];
    const result = await dispatchWindowsAndroidLab({
      argv: ['run', formal], now: 1_000, paths,
      runCommand: (command, args) => {
        calls.push([command, args]);
        return command === 'git' ? runGitCommand(command, args) : { code: 0, output: '' };
      }
    });
    expect(result).toMatchObject({ commitSha: formal, state: 'pending' });
    expect(calls.at(-1)).toEqual(['schtasks.exe', ['/Run', '/TN', 'FolioleAndroidLab']]);
  });
});
