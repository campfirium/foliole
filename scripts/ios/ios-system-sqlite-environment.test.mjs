// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
import { collectIosEnvironment } from './ios-security-environment.mjs';

it.runIf(process.platform === 'darwin')('records OS ownership after SQLCipher is removed without claiming the SDK is the runtime', () => {
  const parent = path.resolve('.tmp/artifacts/T251-9/environment-tests');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, 'sdk-'));
  try {
    mkdirSync(path.join(root, 'usr/include'), { recursive: true });
    writeFileSync(path.join(root, 'usr/include/sqlite3.h'), '#define SQLITE_VERSION "3.46.0"\n');
    const result = collectIosEnvironment({ root,
      inventory: { status: 'resolved', graphs: { app: { pins: [], artifacts: [], manifests: [] } } },
      run: (_command, args) => args.includes('--show-sdk-path') ? root : 'test tool version' });
    expect(result.errors).toEqual([]);
    expect(result.components.sqlcipher).toBeUndefined();
    expect(result.components.systemSqlite).toMatchObject({ provider: 'Apple system SQLite', sdkVersion: '3.46.0' });
    expect(result.components.systemSqlite.runtime).toContain('Not observed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it.runIf(process.platform === 'darwin')('does not treat a missing pinned SQLCipher binary as removal', () => {
  const result = collectIosEnvironment({ root: process.cwd(),
    inventory: { status: 'resolved', graphs: { app: { pins: [{ identity: 'sqlcipher.swift', version: '4.20.0' }],
      artifacts: [], manifests: [] } } }, run: () => 'test tool version' });
  expect(result.errors).toContainEqual({ key: 'resolved-components', reason: 'Resolved SQLCipher binary identity is missing' });
});
