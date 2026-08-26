import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

import {
  createHostReadinessAdapters, createMutationReadinessAdapters
} from './multi-device-sync-host-readiness.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

it('uses explicit A5 serial and a registered Windows action', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  fs.mkdirSync(path.join(repoRoot, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/.bin/cap'), '');
  createIsolatedMacosRoot({ repoRoot, runId: 'run-1' });
  const calls = [];
  const leaseCalls = [];
  const execute = async (command, args) => {
    calls.push([command, args]);
    if (args.includes('devices')) return '87a33a4b               device product:test\n';
    if (args.includes('power')) return 'mWakefulness=Awake\n';
    if (args.includes('policy')) return 'mIsShowing=false INTERACTIVE_STATE_AWAKE\n';
    if (args.includes('route')) return '192.168.0.0/24 dev wlan0 src 192.168.0.110\n';
    if (command === 'ssh') return '[multi-device-sync-readiness] status=ready\n';
    return '';
  };
  const adapters = createHostReadinessAdapters({ execute,
    networkInterfaces: () => ({ en0: [{ address: '192.168.0.10', family: 'IPv4', internal: false }] }),
    probeA5Lease: (...args) => leaseCalls.push(args), repoRoot, runId: 'run-1' });
  await adapters['android-b']();
  await adapters['windows-c']();
  expect(calls.some(([, args]) => args.includes('87a33a4b'))).toBe(true);
  expect(calls.some(([, args]) => args.includes('wait-for-device'))).toBe(true);
  expect(calls.find(([command]) => command === 'ssh')[1].join(' '))
    .toContain('windows-multi-device-sync-readiness.mjs');
  expect(calls.find(([command]) => command === 'ssh')[1].join(' '))
    .toContain('D:/C/foliole/scripts/windows/windows-multi-device-sync-readiness.mjs');
  expect(calls.find(([command]) => command === 'ssh')[1].join(' '))
    .not.toContain('foliole-android-lab-preview');
  expect(calls.find(([command]) => command === 'ssh')[1]).toContain('C:/Progra~1/nodejs/node.exe');
  expect(calls.some(([, args]) => args.includes('am'))).toBe(false);
  expect(leaseCalls).toEqual([[repoRoot]]);
});

it('blocks Android readiness before mutation when the fixed A5 is locked', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  fs.mkdirSync(path.join(repoRoot, 'node_modules/.bin'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'node_modules/.bin/cap'), '');
  createIsolatedMacosRoot({ repoRoot, runId: 'run-2' });
  const execute = async (_command, args) => {
    if (args.includes('devices')) return '87a33a4b device product:test\n';
    if (args.includes('power')) return 'mWakefulness=Awake\n';
    if (args.includes('policy')) return 'mIsShowing=true INTERACTIVE_STATE_AWAKE\n';
    return '';
  };
  const adapters = createHostReadinessAdapters({ execute, probeA5Lease: () => undefined,
    repoRoot, runId: 'run-2' });
  await expect(adapters['android-b']()).rejects.toMatchObject({
    lastSuccessfulAction: 'fixed_a5_awake', missingFact: 'fixed_a5_locked'
  });
});

it('blocks macOS readiness while the fixed sync port is occupied', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  createIsolatedMacosRoot({ repoRoot, runId: 'run-port-busy' });
  const probeMacosSyncPort = async () => {
    throw Object.assign(new Error('address in use'), { code: 'EADDRINUSE' });
  };
  const adapters = createHostReadinessAdapters({ probeMacosSyncPort, repoRoot,
    runId: 'run-port-busy' });
  await expect(adapters['macos-a']()).rejects.toMatchObject({
    lastSuccessfulAction: 'macos_disk_ready',
    missingFact: 'macos_sync_port_occupied'
  });
});

it('records fixed sync port availability in macOS readiness', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  createIsolatedMacosRoot({ repoRoot, runId: 'run-port-free' });
  const ports = [];
  const probeMacosSyncPort = async (port) => ports.push(port);
  const adapters = createHostReadinessAdapters({ probeMacosSyncPort, repoRoot,
    runId: 'run-port-free' });
  await expect(adapters['macos-a']()).resolves.toMatchObject({
    facts: expect.arrayContaining(['macos_sync_port_ready'])
  });
  expect(ports).toEqual([38642]);
});

it('does not require a Windows candidate receipt for an A/B-only target', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  const runId = 'run-ab-only';
  const receiptRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId);
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.writeFileSync(path.join(receiptRoot, 'candidate-preparation.json'), JSON.stringify({
    candidateBoundary: { branch: 'dev', revision: 'a'.repeat(40),
      sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) },
    preparedHosts: ['macos-a', 'android-b'], resultStatus: 'success', runId
  }));
  const execute = async (command) => command === 'ssh'
    ? '[multi-device-sync-readiness] status=ready\n' : '';
  const adapters = createMutationReadinessAdapters({ execute, repoRoot,
    candidateProvider: async () => ({ branch: 'dev', revision: 'a'.repeat(40),
      sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) }),
    requiredHosts: ['macos-a', 'android-b'], runId });
  await expect(adapters['windows-c']()).resolves.toMatchObject({
    facts: expect.arrayContaining(['windows-c_candidate_not_required'])
  });
});

it('rejects a mismatched Windows candidate receipt before product mutation', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-device-hosts-'));
  const runId = 'run-windows-mismatch';
  const receiptRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId);
  fs.mkdirSync(receiptRoot, { recursive: true });
  fs.writeFileSync(path.join(receiptRoot, 'candidate-preparation.json'), JSON.stringify({
    candidateBoundary: { branch: 'dev', revision: 'a'.repeat(40),
      sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) }, preparedHosts: ['windows-c'],
    resultStatus: 'success', runId, windowsReceipt: { revision: 'c'.repeat(40),
      sourceRef: 'refs/heads/dev', targetRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) }
  }));
  const execute = async (command) => command === 'ssh'
    ? '[multi-device-sync-readiness] status=ready\n' : '';
  const adapters = createMutationReadinessAdapters({ execute, repoRoot,
    candidateProvider: async () => ({ branch: 'dev', revision: 'a'.repeat(40),
      sourceRef: 'refs/heads/dev', treeDigest: 'b'.repeat(40) }),
    requiredHosts: ['windows-c'], runId });
  await expect(adapters['windows-c']()).rejects.toMatchObject({
    lastSuccessfulAction: 'windows-c_environment_ready',
    missingFact: 'windows-c_candidate_mismatch'
  });
});
