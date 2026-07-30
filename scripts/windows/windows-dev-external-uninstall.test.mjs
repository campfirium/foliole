// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  parseExternalUninstallArgs, PRESERVED_OLD_ROOT_CHILDREN, removeLegacyKeyLine,
  REMOVED_OLD_ROOT_CHILDREN, validateAuthorizedKeys, validateHostSnapshot,
  validateOldRootInventory
} from './windows-dev-external-uninstall-core.mjs';

const OLD_ROOT = 'C:\\Users\\tester\\AppData\\Local\\Foliole\\windows-android-lab';

function approvedInventory() {
  const directories = new Set([
    ...PRESERVED_OLD_ROOT_CHILDREN,
    ...REMOVED_OLD_ROOT_CHILDREN.filter((name) => name.startsWith('.runtime-update-backup-')),
    'empty-git-hooks', 'runtime', 'runtime-recovery', 'worker-empty-hooks'
  ]);
  return [...PRESERVED_OLD_ROOT_CHILDREN, ...REMOVED_OLD_ROOT_CHILDREN]
    .map((name) => ({ name, type: directories.has(name) ? 'directory' : 'file' }));
}

function host(task = true) {
  return {
    isAdmin: true,
    nodePackages: [{ displayName: 'Node.js', displayVersion: '22.23.2',
      productCode: '{12345678-1234-1234-1234-123456789ABC}', publisher: 'Node.js Foundation', windowsInstaller: 1 }],
    nodeSignature: { status: 'Valid' }, oldProcesses: [],
    scheduledTask: task ? { actions: [{
      arguments: `"${OLD_ROOT}\\windows-android-lab-worker.mjs"`,
      execute: `${OLD_ROOT}\\runtime\\node.exe`
    }], name: 'FolioleAndroidLab', taskPath: '\\' } : null
  };
}

describe('Windows DEV external uninstall', () => {
  it('is dry-run by default and requires an exact manifest for apply or verify', () => {
    expect(parseExternalUninstallArgs([])).toEqual({ mode: 'dry-run' });
    expect(parseExternalUninstallArgs(['--apply', 'C:\\evidence\\manifest.json']))
      .toEqual({ manifestPath: 'C:\\evidence\\manifest.json', mode: 'apply' });
    expect(parseExternalUninstallArgs(['--verify', 'C:\\evidence\\manifest.json']).mode).toBe('verify');
    expect(() => parseExternalUninstallArgs(['--apply'])).toThrow('accepts no arguments');
  });

  it('accepts only the approved exact old-root inventory and preserves data owners', () => {
    expect(validateOldRootInventory(approvedInventory())).toHaveLength(
      PRESERVED_OLD_ROOT_CHILDREN.length + REMOVED_OLD_ROOT_CHILDREN.length
    );
    expect(() => validateOldRootInventory([...approvedInventory(), { name: 'unknown', type: 'file' }]))
      .toThrow('differs from the approved exact target list');
    expect(REMOVED_OLD_ROOT_CHILDREN).not.toEqual(expect.arrayContaining(PRESERVED_OLD_ROOT_CHILDREN));
    expect(validateOldRootInventory(PRESERVED_OLD_ROOT_CHILDREN.map((name) => ({ name, type: 'directory' })), true))
      .toHaveLength(3);
  });

  it('keeps shell and new receiver keys while removing at most one exact legacy line', () => {
    const shell = 'no-port-forwarding ssh-ed25519 AAAAshell';
    const oldLine = `command="node ${OLD_ROOT}\\windows-android-lab-receive.mjs" ssh-ed25519 AAAAold`;
    const nextLine = 'command="& C:\\Program Files\\nodejs\\node.exe C:\\Users\\tester\\AppData\\Local\\Foliole\\windows-dev-git\\receive.mjs" ssh-ed25519 AAAAnew';
    const content = `${shell}\r\n${oldLine}\r\n${nextLine}\r\n`;
    const identity = validateAuthorizedKeys(content);
    expect(identity).toMatchObject({ legacyIndex: 1, shellLineCount: 1 });
    expect(removeLegacyKeyLine(content, identity)).toBe(`${shell}\r\n${nextLine}\r\n`);
    expect(() => validateAuthorizedKeys(`${nextLine}\n${oldLine}\n${oldLine}\n`)).toThrow('at most one');
  });

  it('fails closed on task, process, admin, package, or signature drift', () => {
    expect(validateHostSnapshot(host(), OLD_ROOT, true)).toMatchObject({ displayVersion: '22.23.2' });
    expect(validateHostSnapshot(host(false), OLD_ROOT, false)).toMatchObject({ displayName: 'Node.js' });
    expect(() => validateHostSnapshot({ ...host(), oldProcesses: [{ processId: 4 }] }, OLD_ROOT, true))
      .toThrow('active processes');
    expect(() => validateHostSnapshot({ ...host(), isAdmin: false }, OLD_ROOT, true)).toThrow('not an administrator');
    expect(() => validateHostSnapshot({ ...host(false), scheduledTask: host().scheduledTask }, OLD_ROOT, false))
      .toThrow('still exists');
  });

  it('uses exact destructive targets and never removes the old root itself', () => {
    const source = fs.readFileSync('scripts/windows/windows-dev-external-uninstall.mjs', 'utf8');
    expect(source).toContain("run('schtasks.exe', ['/Delete', '/TN', 'FolioleAndroidLab', '/F'])");
    expect(source).toContain('REMOVED_OLD_ROOT_CHILDREN.includes(target.name)');
    expect(source).toContain("fs.rmSync(target.path, { force: false, recursive: target.type === 'directory' })");
    expect(source).not.toMatch(/rmSync\(paths\.oldLabRoot|Remove-Item|\brm\s+-rf\b/u);
  });
});
