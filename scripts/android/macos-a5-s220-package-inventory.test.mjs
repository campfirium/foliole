import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { inspectS220A5Packages, S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

it('uses only fixed read-only package queries and refuses an occupied S220 identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-s220-inventory-'));
  roots.push(root);
  const calls = [];
  const { receipt, filePath } = await inspectS220A5Packages({
    assertFixed: () => calls.push('fixed'),
    execute: async (_adb, args) => {
      calls.push(args);
      if (args.at(-1) === 'policy') return { code: 0, stdout: 'isKeyguardShowing=false\n', stderr: '' };
      return { code: 0, stdout: args.at(-1) === S220_APP_ID
        ? 'package:/data/app/s220/base.apk\n' : '', stderr: '' };
    },
    paths: { adb: '/fixed/adb', artifactsRoot: root }, serial: 'fixed-a5'
  });
  expect(calls[0]).toBe('fixed');
  expect(calls.slice(1)).toEqual([
    ['-s', 'fixed-a5', 'shell', 'dumpsys', 'window', 'policy'],
    ['-s', 'fixed-a5', 'shell', 'pm', 'path', '--user', '0', 'com.foliole.android'],
    ['-s', 'fixed-a5', 'shell', 'pm', 'path', '--user', '0', 'com.foliole.android.acceptance'],
    ['-s', 'fixed-a5', 'shell', 'pm', 'path', '--user', '0', S220_APP_ID]
  ]);
  expect(receipt.s220PackageAvailable).toBe(false);
  expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).packages[S220_APP_ID].installed).toBe(true);
  expect(assertRegisteredMacosA5Action('s220-package-inventory')).toMatchObject({
    mutatesFixedA5: false, formalSourceClass: 'source-free-readonly'
  });
});

it('fails closed on an unexpected package response', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-s220-inventory-'));
  roots.push(root);
  await expect(inspectS220A5Packages({
    assertFixed: () => undefined,
    execute: async (_adb, args) => args.at(-1) === 'policy'
      ? { code: 0, stdout: '', stderr: '' }
      : { code: 1, stdout: '', stderr: 'unexpected response' },
    paths: { adb: '/fixed/adb', artifactsRoot: root }, serial: 'fixed-a5'
  })).rejects.toThrow('Unexpected package inventory response');
  expect(fs.existsSync(path.join(root, 'S220', 'a5-package-inventory.json'))).toBe(false);
});

it('treats the fixed A5 package-manager exit 1 with no output as absent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-s220-inventory-'));
  roots.push(root);
  const { receipt } = await inspectS220A5Packages({
    assertFixed: () => undefined,
    execute: async (_adb, args) => args.at(-1) === 'policy'
      ? { code: 0, stdout: 'isKeyguardShowing=false\n', stderr: '' }
      : { code: 1, stdout: '', stderr: '' },
    paths: { adb: '/fixed/adb', artifactsRoot: root }, serial: 'fixed-a5'
  });
  expect(receipt.s220PackageAvailable).toBe(true);
  expect(receipt.packages[S220_APP_ID].installed).toBe(false);
});
