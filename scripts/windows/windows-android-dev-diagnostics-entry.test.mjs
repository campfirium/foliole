// @vitest-environment node

import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { normalizeHostSnapshot } from './windows-android-dev-diagnostics-core.mjs';
import {
  queryAdbDevicesLong, runWindowsAndroidDevDiagnostics
} from './windows-android-dev-diagnostics.mjs';

const IMAGE = 'C:\\Android\\platform-tools\\adb.exe';
const HASH = 'a'.repeat(64);

function snapshot(listeners = []) {
  const process = {
    imagePath: IMAGE, imageSha256: HASH, name: 'adb.exe', owner: 'v\\zephu',
    parentProcessId: 10, processId: 41, sessionId: 0
  };
  return normalizeHostSnapshot({
    adbClient: { ...process, owner: null, parentProcessId: null, processId: null,
      resolutionSource: 'local-app-data-android-sdk', sessionId: null },
    adbProcesses: [process], authorizedKeys: { entries: [{ forcedCommand: false, keySha256: 'fingerprint',
      keyType: 'ssh-ed25519', restrictions: ['no-port-forwarding'] }], path: 'C:\\ProgramData\\ssh\\keys' },
    capturedAt: '2026-07-30T00:00:00.000Z', listeners,
    oldRuntime: { entries: [{ lastWriteTimeUtc: '2026-07-30T00:00:00.000Z', length: null,
      name: 'evidence', type: 'directory' }], exists: true, root: 'C:\\runtime' },
    pnpDevices: [{ class: 'AndroidUsbDeviceClass', instanceId: 'USB\\A5', name: 'A5', status: 'OK' }],
    scheduledTask: { actions: [], lastTaskResult: 0, name: 'FolioleAndroidLab', principal: 'v\\zephu',
      state: 'Ready', taskPath: '\\' },
    sshSession: { clientAddress: '192.168.0.2', clientPort: 40000, parentProcessId: 2,
      processId: 3, serverAddress: '192.168.0.11', serverPort: 22, sessionId: 0, user: 'v\\zephu' }
  });
}

function repoAt(repoRoot) {
  return { branch: 'dev', head: 'f'.repeat(40), remoteNames: ['lan'], repoRoot, statusShort: [], upstream: 'lan/dev' };
}

function captureStream() {
  let value = '';
  return { stream: { write: (chunk) => { value += chunk; } }, value: () => value };
}

describe('Windows Android DEV diagnostic entry', () => {
  it('writes a repository-local summary and probes only a verified listener', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-dev-diagnostic-'));
    const stdout = captureStream();
    const query = vi.fn(async () => '87a33a4b\tdevice product:A5 model:BOOX transport_id:1\n');
    const current = snapshot([{ localAddress: '127.0.0.1', localPort: 5037, owningProcess: 41, state: 'Listen' }]);
    const result = await runWindowsAndroidDevDiagnostics({
      argv: [], id: () => '12345678-rest', now: () => new Date('2026-07-30T01:02:03.000Z'), platform: 'win32',
      query, resolveRepo: () => repoAt(root), snapshot: () => current, stderr: captureStream().stream, stdout: stdout.stream
    });

    expect(result.exitCode).toBe(0);
    expect(result.evidencePath).toContain(path.join(root, '.tmp', 'artifacts', 'windows-android-dev'));
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith('127.0.0.1', 5037);
    expect(result.summary.transportsByPort['5037']).toMatchObject({
      status: 'present', transports: [{ serial: '87a33a4b', state: 'device' }]
    });
    expect(result.summary.transportsByPort['5601']).toEqual({ port: 5601, status: 'not-listening' });
    expect(result.summary.adbClient.resolutionSource).toBe('local-app-data-android-sdk');
    expect(result.summary.oldRuntime.entries[0].length).toBeNull();
    expect(stdout.value()).toContain('status: OK evidence=');
    expect(JSON.parse(fs.readFileSync(result.evidencePath, 'utf8'))).toMatchObject({ resultStatus: 'success' });
  });

  it('persists command failure exit semantics without leaking secret-shaped stderr', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-dev-diagnostic-failure-'));
    const stderr = captureStream();
    const failure = Object.assign(new Error('ssh-ed25519 AAAAAAAAAAAAAAAAAAAA token=secret'), {
      exitCode: 74, failureStage: 'host-snapshot'
    });
    const result = await runWindowsAndroidDevDiagnostics({
      argv: [], id: () => '87654321-rest', now: () => new Date('2026-07-30T01:02:03.000Z'), platform: 'win32',
      resolveRepo: () => repoAt(root), snapshot: () => { throw failure; }, stderr: stderr.stream, stdout: captureStream().stream
    });

    expect(result).toMatchObject({ exitCode: 74, summary: { failureStage: 'host-snapshot', resultStatus: 'failure' } });
    expect(result.summary.message).toBe('ssh-ed25519 [redacted-key] [redacted-secret]');
    expect(stderr.value()).not.toContain('secret');
    expect(JSON.parse(fs.readFileSync(result.evidencePath, 'utf8')).message).not.toContain('AAAAAAAA');
  });

  it('maps an existing-server query failure to the fixed child failure exit', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-dev-diagnostic-probe-failure-'));
    const current = snapshot([{ localAddress: '127.0.0.1', localPort: 5037, owningProcess: 41, state: 'Listen' }]);
    const result = await runWindowsAndroidDevDiagnostics({
      argv: [], id: () => 'probeerr-rest', now: () => new Date('2026-07-30T01:02:03.000Z'), platform: 'win32',
      query: async () => { throw new Error('server closed'); }, resolveRepo: () => repoAt(root),
      snapshot: () => current, stderr: captureStream().stream, stdout: captureStream().stream
    });
    expect(result).toMatchObject({ exitCode: 74, summary: { failureStage: 'adb-probe' } });
  });

  it('speaks host:devices-l directly to an existing server without an adb process launch', async () => {
    const socket = new EventEmitter();
    let request = '';
    socket.setTimeout = vi.fn();
    socket.destroy = vi.fn();
    socket.end = vi.fn(() => socket.emit('end'));
    socket.write = vi.fn((buffer) => {
      request = buffer.toString('utf8');
      const payload = 'serial-Exact\tdevice product:A5\n';
      const length = payload.length.toString(16).padStart(4, '0');
      socket.emit('data', Buffer.from('OKAY'));
      socket.emit('data', Buffer.from(`${length}${payload}`));
    });
    const createConnection = vi.fn(() => {
      Promise.resolve().then(() => socket.emit('connect'));
      return socket;
    });

    await expect(queryAdbDevicesLong('127.0.0.1', 5037, createConnection))
      .resolves.toBe('serial-Exact\tdevice product:A5\n');
    expect(createConnection).toHaveBeenCalledWith({ host: '127.0.0.1', port: 5037 });
    expect(request).toBe('000ehost:devices-l');
  });

  it('keeps the PowerShell host probe read-only and outside A5 evidence', () => {
    const powershell = fs.readFileSync('scripts/windows/windows-android-dev-diagnostics.ps1', 'utf8');
    const entry = fs.readFileSync('scripts/windows/windows-android-dev-diagnostics.mjs', 'utf8');
    expect(powershell).toContain('Get-NetTCPConnection -State Listen');
    expect(powershell).toContain('Get-CimInstance Win32_PnPEntity');
    expect(powershell).toContain('Get-ScheduledTask -ErrorAction Stop');
    expect(powershell).toContain('resolutionSource = "local-app-data-android-sdk"');
    expect(powershell).not.toContain('Get-Command adb.exe');
    expect(powershell).not.toMatch(/kill-server|start-server|\badb(?:\.exe)?\s+connect\b|Restart-Service|Register-ScheduledTask/iu);
    expect(entry).toContain("'.tmp', 'artifacts', 'windows-android-dev'");
    expect(entry).not.toContain('windows-android-lab/evidence');
  });
});
