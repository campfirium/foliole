// @vitest-environment node
/* global process */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

import { approvalFixtureSources } from './android-sync-group-approval-result.fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

it('returns renderable provider state after Android approves a joining device', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-approval-result-'));
  try {
    const sources = Object.entries(approvalFixtureSources).map(([name, source]) => {
      const target = path.join(directory, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
      return target;
    });
    sources.push(path.join(root, 'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncGroupProvider.java'));
    const javaHome = process.env.JAVA_HOME ?? (process.platform === 'darwin'
      ? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' : null);
    const binary = (name) => javaHome ? path.join(javaHome, 'bin', name) : name;
    const compiled = spawnSync(binary('javac'), ['-d', directory, ...sources], { encoding: 'utf8' });
    expect(compiled.error ?? compiled.stderr).toBe('');
    expect(compiled.status).toBe(0);
    const result = spawnSync(binary('java'), ['-cp', directory, 'com.foliole.android.ApprovalFixture'], {
      encoding: 'utf8'
    });
    expect(result.error ?? result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Approval returns complete provider state');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
