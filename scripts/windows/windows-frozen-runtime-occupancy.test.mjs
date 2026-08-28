// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import { frozenRuntimeFingerprint } from './windows-frozen-runtime-occupancy.mjs';

it('fingerprints the first task runtime dependency and native module', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frozen-runtime-'));
  const nativeRoot = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release');
  fs.mkdirSync(nativeRoot, { recursive: true });
  fs.writeFileSync(path.join(root, 'package-lock.json'), 'lock');
  fs.writeFileSync(path.join(nativeRoot, 'better_sqlite3.node'), 'native');
  expect(frozenRuntimeFingerprint(root)).toMatchObject({
    lockfileDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    nativeModuleDigest: expect.stringMatching(/^[0-9a-f]{64}$/u), sourceRoot: root
  });
  fs.rmSync(root, { force: true, recursive: true });
});
