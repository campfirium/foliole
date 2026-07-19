// @vitest-environment node
/* global process */

import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GATE = path.join(REPO_ROOT, 'scripts/sync/ios-capacitor-sqlite-capability-gate.mjs');

describe('iOS Capacitor SQLite capability gate', () => {
  it.runIf(process.platform === 'darwin')('uses an explicit Swift Package workspace with Xcode 26', async () => {
    const fixture = await createFixture();
    const result = spawnSync(process.execPath, [GATE], {
      cwd: fixture.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        FOLIOLE_GATE_LOG: fixture.log,
        PATH: `${fixture.bin}${path.delimiter}${process.env.PATH}`
      }
    });

    expect(result.status, result.stderr).toBe(0);
    const invocations = await readFile(fixture.log, 'utf8');
    expect(invocations).toContain('-list -json -workspace');
    expect(invocations).toContain('test -workspace');
    expect(invocations).toContain('-only-testing:CapacitorSQLitePluginTests/FolioleSqliteCapabilityTests');
    await expectWorkspaceAndTestSources(fixture.root);
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'foliole-ios-gate-'));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'xcodebuild.log');
  await mkdir(bin, { recursive: true });
  await writeExecutable(path.join(bin, 'xcodebuild'), xcodebuildStub());
  await writeExecutable(path.join(bin, 'xcrun'), xcrunStub());
  return { bin, log, root };
}

async function writeExecutable(file, source) {
  await writeFile(file, source, 'utf8');
  await chmod(file, 0o755);
}

async function expectWorkspaceAndTestSources(root) {
  const plugin = path.join(root, 'node_modules/@capacitor-community/sqlite');
  const workspace = await readFile(path.join(plugin, '.swiftpm/xcode/package.xcworkspace/contents.xcworkspacedata'), 'utf8');
  const test = await readFile(path.join(plugin, 'ios/PluginTests/FolioleSqliteCapabilityTests.swift'), 'utf8');
  expect(workspace).toContain('<FileRef location="self:">');
  expect(test).toContain('testAttachTransactionBlobAndSqlSurface');
}

function xcodebuildStub() {
  return `#!/bin/sh
printf '%s\n' "$*" >> "$FOLIOLE_GATE_LOG"
if [ "$1" = "-list" ]; then
  printf '%s\n' '{"workspace":{"schemes":["CapacitorCommunitySqlite"]}}'
fi
`;
}

function xcrunStub() {
  return `#!/bin/sh
printf '%s\n' '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-26-5":[{"isAvailable":true,"name":"iPhone 17","udid":"SIM-1"}]}}'
`;
}
