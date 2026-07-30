// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  finalizeTransportResults, normalizeHostSnapshot, parseAdbDevicesLong, planTransportProbes,
  redactDiagnosticText
} from './windows-android-dev-diagnostics-core.mjs';

const IMAGE = 'C:\\Android\\platform-tools\\adb.exe';
const HASH = 'a'.repeat(64);

function processRecord(processId = 41, overrides = {}) {
  return {
    imagePath: IMAGE, imageSha256: HASH, name: 'adb.exe', owner: 'v\\zephu',
    parentProcessId: 10, processId, sessionId: 0, ...overrides
  };
}

function listener(localPort, owningProcess = 41, localAddress = '127.0.0.1') {
  return { localAddress, localPort, owningProcess, state: 'Listen' };
}

function snapshot(overrides = {}) {
  return normalizeHostSnapshot({
    adbClient: processRecord(null, { owner: null, parentProcessId: null, processId: null, sessionId: null }),
    adbProcesses: [processRecord()],
    authorizedKeys: { entries: [], path: 'C:\\ProgramData\\ssh\\administrators_authorized_keys' },
    capturedAt: '2026-07-30T00:00:00.000Z',
    listeners: [], oldRuntime: { entries: [], exists: true, root: 'C:\\runtime' },
    pnpDevices: [], scheduledTask: null,
    sshSession: { clientAddress: '192.168.0.2', clientPort: 40000, parentProcessId: 2,
      processId: 3, serverAddress: '192.168.0.11', serverPort: 22, sessionId: 0, user: 'v\\zephu' },
    ...overrides
  });
}

describe('Windows Android DEV diagnostic probe contract', () => {
  it('does not probe either port when no listener exists', () => {
    expect(planTransportProbes(snapshot())).toEqual([
      { port: 5037, status: 'not-listening' },
      { port: 5601, status: 'not-listening' }
    ]);
  });

  it('probes one matching listener and leaves the unbound port untouched', () => {
    expect(planTransportProbes(snapshot({ listeners: [listener(5037)] }))).toEqual([
      { address: '127.0.0.1', port: 5037, status: 'probe-ready' },
      { port: 5601, status: 'not-listening' }
    ]);
  });

  it('allows one read-only probe for each of two matching listeners', () => {
    const actual = planTransportProbes(snapshot({ listeners: [listener(5037), listener(5601)] }));
    expect(actual.map(({ port, status }) => ({ port, status }))).toEqual([
      { port: 5037, status: 'probe-ready' },
      { port: 5601, status: 'probe-ready' }
    ]);
  });

  it('refuses path, hash, and ambiguous-owner mismatches', () => {
    const pathMismatch = snapshot({
      adbProcesses: [processRecord(41, { imagePath: 'C:\\Other\\adb.exe' })], listeners: [listener(5037)]
    });
    expect(planTransportProbes(pathMismatch)[0]).toMatchObject({
      reason: 'image-path-mismatch', status: 'version-mismatch-not-probed'
    });
    const hashMismatch = snapshot({
      adbProcesses: [processRecord(41, { imageSha256: 'b'.repeat(64) })], listeners: [listener(5037)]
    });
    expect(planTransportProbes(hashMismatch)[0]).toMatchObject({
      reason: 'image-hash-mismatch', status: 'version-mismatch-not-probed'
    });
    expect(planTransportProbes(snapshot({ listeners: [listener(5037), listener(5037, 42)] }))[0])
      .toMatchObject({ reason: 'multiple-listener-owners', status: 'not-probed' });
  });

  it('fails closed when a listener owner cannot be fully resolved', () => {
    const unresolved = snapshot({ adbProcesses: [processRecord(41, { owner: null })], listeners: [listener(5037)] });
    expect(() => planTransportProbes(unresolved)).toThrow('listener owner could not be resolved');
  });

  it('keeps PnP evidence separate from an empty transport result', () => {
    const value = snapshot({
      listeners: [listener(5037)],
      pnpDevices: [{ class: 'AndroidUsbDeviceClass', instanceId: 'USB\\VID_18D1', name: 'A5', status: 'OK' }]
    });
    expect(value.pnpDevices).toEqual([
      { class: 'AndroidUsbDeviceClass', instanceId: 'USB\\VID_18D1', name: 'A5', status: 'OK' }
    ]);
    expect(parseAdbDevicesLong('')).toEqual([]);
  });

  it('preserves exact serials and long transport attributes', () => {
    expect(parseAdbDevicesLong('87a33A4b\tdevice product:A5 model:BOOX transport_id:7\r\n')).toEqual([{
      details: { model: 'BOOX', product: 'A5', transport_id: '7' }, serial: '87a33A4b', state: 'device'
    }]);
    expect(parseAdbDevicesLong('serial-with-case   unauthorized usb:1-2')).toEqual([{
      details: { 'usb': '1-2' }, serial: 'serial-with-case', state: 'unauthorized'
    }]);
    expect(() => parseAdbDevicesLong('malformed')).toThrow('invalid transport row');
  });

  it('marks a probed port when its listener identity changes', () => {
    const before = snapshot({ listeners: [listener(5037)] });
    const after = snapshot({ listeners: [listener(5037, 99)] });
    expect(finalizeTransportResults(before, after, [{ port: 5037, status: 'empty', transports: [] }])[0])
      .toMatchObject({ status: 'probe-mutated-state' });
    expect(finalizeTransportResults(before, before, [{ port: 5037, status: 'present', transports: [] }])[0])
      .toMatchObject({ status: 'present' });
  });

  it('allowlists snapshot fields and redacts secret-shaped errors', () => {
    const value = snapshot({
      authorizedKeys: { entries: [{ forcedCommand: false, keyBody: 'AAAAsecret', keySha256: 'safe',
        keyType: 'ssh-ed25519', rawLine: 'ssh-ed25519 AAAAsecret comment', restrictions: [] }], path: 'keys' }
    });
    expect(JSON.stringify(value)).not.toContain('AAAAsecret');
    expect(value.adbClient.processId).toBeNull();
    expect(value.oldRuntime.entries[0]?.length ?? null).toBeNull();
    expect(redactDiagnosticText('ssh-ed25519 AAAAAAAAAAAAAAAAAAAA token=secret')).toBe(
      'ssh-ed25519 [redacted-key] [redacted-secret]'
    );
  });
});
