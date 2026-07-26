// @vitest-environment node

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runAndroidLabOperation } from './windows-android-lab-operation.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'b'.repeat(40);
const ENDPOINT = '192.168.0.107:38717';
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-lab-operation-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  fs.mkdirSync(path.join(paths.candidate, 'scripts', 'windows'), { recursive: true });
  fs.writeFileSync(path.join(paths.candidate, 'scripts', 'windows', 'probe.mjs'), 'console.log("probe")\n');
  writeJsonAtomic(paths.device, { endpoint: ENDPOINT, identity: 'A5-STABLE' });
  return {
    config: {
      adbPath: 'adb.exe', deviceIdentity: 'A5-STABLE', javaHome: 'C:\\Java',
      nodeDirectory: 'C:\\Node', schemaVersion: 2
    },
    paths
  };
}

function request(runId, operation, overrides = {}) {
  return {
    commitSha: SHA, cwd: { path: '', scope: 'checkout' }, mode: 'automation', operation,
    requestId: runId, requestSha256: 'c'.repeat(64), runId, schemaVersion: 1,
    target: 'windows', timeoutMs: 30_000, ...overrides
  };
}

describe('Windows Android Lab worker operations', () => {
  it('runs a commit-bound repository runner and records stdout, stderr, argv, and exit code', async () => {
    const { config, paths } = fixture();
    const calls = [];
    await runAndroidLabOperation({ config, paths, request: request('repo-run', {
      args: ['--check'], kind: 'repository', runner: 'scripts/windows/probe.mjs'
    }), executeCommand: async (command, args, options) => {
      calls.push({ args, command, options });
      return { code: 0, lines: ['ok'], output: 'ok\nwarning\n', stderr: 'warning\n', stdout: 'ok\n' };
    } });
    expect(calls[0]).toMatchObject({ command: path.join('C:\\Node', 'node.exe') });
    expect(calls[0].options).toMatchObject({ timeoutMs: 30_000 });
    expect(calls[0].options).not.toHaveProperty('shell');
    expect(fs.readFileSync(path.join(paths.evidence, 'repo-run', 'stdout.txt'), 'utf8')).toBe('ok\n');
    expect(fs.readFileSync(path.join(paths.evidence, 'repo-run', 'stderr.txt'), 'utf8')).toBe('warning\n');
    expect(readJson(path.join(paths.evidence, 'repo-run', 'command-audit.json'))).toMatchObject({
      commands: [expect.objectContaining({ exitCode: 0 })], resultStatus: 'success'
    });
  });

  it('injects the verified A5 serial and audits device discovery plus the requested ADB command', async () => {
    const { config, paths } = fixture();
    const calls = [];
    const executeCommand = async (command, args) => {
      calls.push({ args, command });
      if (args[0] === 'devices') return { code: 0, lines: [`${ENDPOINT} device`], output: `${ENDPOINT}\tdevice\n` };
      if (args.includes('ro.serialno')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
      return { code: 0, lines: ['A5'], output: 'A5\n', stdout: 'A5\n', stderr: '' };
    };
    await runAndroidLabOperation({ config, executeCommand, paths, request: request('adb-run', {
      args: ['shell', 'getprop', 'ro.product.model'], kind: 'adb'
    }, { cwd: { path: '', scope: 'lab' }, target: 'a5' }) });
    expect(calls.at(-1)).toEqual({ args: ['-s', ENDPOINT, 'shell', 'getprop', 'ro.product.model'], command: 'adb.exe' });
    expect(readJson(path.join(paths.evidence, 'adb-run', 'command-audit.json')).commands.length).toBeGreaterThan(1);
  });

  it('runs Windows client status and a run-scoped Node diagnostic without a shell', async () => {
    const { config, paths } = fixture();
    const calls = [];
    const executeCommand = async (command, args, options) => {
      calls.push({ args, command, options });
      return { code: 0, lines: ['ok'], output: 'ok\n', stderr: '', stdout: 'ok\n' };
    };
    await runAndroidLabOperation({ config, executeCommand, paths, request: request('client-run', {
      action: 'status', kind: 'windowsClient'
    }) });
    const content = Buffer.from('console.log("diagnostic")\n');
    await runAndroidLabOperation({ config, executeCommand, paths, request: request('diagnostic-run', {
      args: [], contentBase64: content.toString('base64'), contentSha256: 'unused-by-worker',
      fileName: 'probe.mjs', kind: 'diagnostic', runtime: 'node'
    }, { cwd: { path: '', scope: 'run' }, mode: 'diagnostic' }) });
    expect(calls[0].args.at(-1)).toBe('status');
    expect(calls[1].args[0]).toContain(path.join('diagnostic-run', 'diagnostic', 'probe.mjs'));
    expect(calls.every((call) => call.options.shell === undefined)).toBe(true);
  });

  it('records timeout termination and bounded partial streams', async () => {
    const { config, paths } = fixture();
    const timedOut = Object.assign(new Error('probe timed out'), {
      code: 'request_timeout', stderr: 'partial error\n', stdout: 'partial output\n'
    });
    await expect(runAndroidLabOperation({ config, paths, request: request('timeout-run', {
      args: [], kind: 'repository', runner: 'scripts/windows/probe.mjs'
    }), executeCommand: async () => { throw timedOut; } })).rejects.toMatchObject({ code: 'request_timeout' });
    expect(readJson(path.join(paths.evidence, 'timeout-run', 'command-audit.json'))).toMatchObject({
      resultStatus: 'failure', terminationReason: 'timeout'
    });
    expect(fs.readFileSync(path.join(paths.evidence, 'timeout-run', 'stdout.txt'), 'utf8')).toContain('partial output');
    expect(fs.readFileSync(path.join(paths.evidence, 'timeout-run', 'stderr.txt'), 'utf8')).toContain('partial error');
  });
});
