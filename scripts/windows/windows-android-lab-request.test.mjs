// @vitest-environment node

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  loadAndroidLabEnvelope, parseAndroidLabEnvelope, validateAndroidLabEnvelope
} from './windows-android-lab-request.mjs';

const SHA = 'a'.repeat(40);

function request(operation, overrides = {}) {
  return {
    commitSha: SHA, cwd: { path: '', scope: 'checkout' }, mode: 'automation',
    operation, requestId: 'request-1', schemaVersion: 1, target: 'windows', timeoutMs: 30_000,
    ...overrides
  };
}

describe('Windows Android Lab request envelope', () => {
  it('verifies the exact payload hash and commit-bound repository runner', () => {
    const envelope = request({ args: ['--check'], kind: 'repository', runner: 'scripts/windows/windows-native-check.mjs' });
    const payload = Buffer.from(`${JSON.stringify(envelope)}\n`);
    const sha256 = createHash('sha256').update(payload).digest('hex');
    expect(parseAndroidLabEnvelope(payload, payload.length, sha256)).toMatchObject({ envelope, sha256 });
    expect(() => parseAndroidLabEnvelope(payload, payload.length, '0'.repeat(64))).toThrow('hash');
  });

  it('fails closed for escaped cwd, caller-owned serial, and dangerous ADB', () => {
    expect(() => validateAndroidLabEnvelope(request(
      { args: [], kind: 'repository', runner: 'scripts/windows/windows-native-check.mjs' },
      { cwd: { path: '..\\outside', scope: 'checkout' } }
    ))).toThrow('Lab scope');
    expect(() => validateAndroidLabEnvelope(request(
      { args: ['-s', 'other', 'devices'], kind: 'adb' },
      { cwd: { path: '', scope: 'lab' }, target: 'a5' }
    ))).toThrow('worker-owned');
    let dangerous;
    try {
      validateAndroidLabEnvelope(request(
        { args: ['shell', 'pm', 'clear', 'com.foliole.android'], kind: 'adb' },
        { cwd: { path: '', scope: 'lab' }, target: 'a5' }
      ));
    } catch (error) { dangerous = error; }
    expect(dangerous).toMatchObject({ code: 'approval_required' });
  });

  it('embeds and hashes a run-scoped diagnostic source file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-lab-request-'));
    try {
      fs.writeFileSync(path.join(root, 'probe.mjs'), 'console.log("safe probe")\n');
      fs.writeFileSync(path.join(root, 'request.json'), JSON.stringify(request(
        { args: [], kind: 'diagnostic', runtime: 'node', sourcePath: 'probe.mjs' },
        { cwd: { path: '', scope: 'run' }, mode: 'diagnostic' }
      )));
      const loaded = loadAndroidLabEnvelope(path.join(root, 'request.json'));
      expect(loaded.envelope.operation).toMatchObject({ fileName: 'probe.mjs' });
      expect(loaded.envelope.operation.contentSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(loaded.payload.length).toBeGreaterThan(loaded.envelope.operation.contentBase64.length);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
