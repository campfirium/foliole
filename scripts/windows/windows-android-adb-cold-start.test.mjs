// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  chooseAdbPort, EXPECTED_A5_SERIAL, EXPECTED_ADB_PATH, EXPECTED_ADB_SHA256,
  parseColdStartArgs, runColdStartExperiment, validateColdStartSnapshot
} from './windows-android-adb-cold-start.mjs';

function processRecord(processId = null) {
  return { imagePath: EXPECTED_ADB_PATH, imageSha256: EXPECTED_ADB_SHA256, name: 'adb.exe',
    owner: processId ? 'V\\zephu' : null, parentProcessId: null, processId, sessionId: processId ? 0 : null };
}

function snapshot(listeningPort = null) {
  const processId = listeningPort ? 41 : null;
  return {
    adbClient: processRecord(), adbProcesses: processId ? [processRecord(processId)] : [],
    listeners: processId ? [{ localAddress: '127.0.0.1', localPort: listeningPort, owningProcess: processId, state: 'Listen' }] : [],
    oldRuntime: { entries: [{ lastWriteTimeUtc: '2026-07-30T00:00:00Z', name: 'evidence', type: 'directory' }], exists: true, root: 'C:\\runtime' },
    pnpDevices: [{ class: 'USB', instanceId: `USB\\VID_2717\\${EXPECTED_A5_SERIAL.toUpperCase()}`, name: 'A5', status: 'OK' }],
    scheduledTask: { state: 'Ready' }
  };
}

describe('one-off Windows ADB cold-start contract', () => {
  it('is dry-run by default and rejects every other argument', () => {
    expect(parseColdStartArgs([])).toEqual({ apply: false });
    expect(parseColdStartArgs(['--apply'])).toEqual({ apply: true });
    expect(() => parseColdStartArgs(['--port', '5037'])).toThrow('only --apply');
  });

  it('fails closed for a running legacy task or a different adb image', () => {
    expect(() => validateColdStartSnapshot({ ...snapshot(), scheduledTask: { state: 'Running' } }))
      .toThrow('still running');
    expect(() => validateColdStartSnapshot({ ...snapshot(), adbClient: { ...processRecord(), imageSha256: 'b'.repeat(64) } }))
      .toThrow('hash differs');
  });

  it('chooses 5037 when both work, otherwise the sole visible port', () => {
    expect(chooseAdbPort([{ port: 5037, a5Visible: true }, { port: 5601, a5Visible: true }])).toBe(5037);
    expect(chooseAdbPort([{ port: 5037, a5Visible: false }, { port: 5601, a5Visible: true }])).toBe(5601);
    expect(chooseAdbPort([{ port: 5037, a5Visible: false }, { port: 5601, a5Visible: false }])).toBeNull();
  });

  it('does not invoke adb in dry-run mode', () => {
    const commands = [];
    const result = runColdStartExperiment({
      apply: false, runAdb: (args) => commands.push(args), snapshot: () => snapshot(5601)
    });
    expect(result.resultStatus).toBe('dry-run');
    expect(commands).toEqual([]);
  });

  it('cold-starts each port serially and leaves only the preferred route', () => {
    let listeningPort = 5601;
    const commands = [];
    const runAdb = (args) => {
      commands.push(args.join(' '));
      const port = Number(args[1]);
      if (args.includes('kill-server')) listeningPort = null;
      if (args.includes('start-server')) listeningPort = port;
      const stdout = args.includes('devices')
        ? `List of devices attached\n${EXPECTED_A5_SERIAL}\tdevice product:marble\n`
        : args.includes('get-state') ? 'device\n' : '';
      return { args, exitCode: 0, stderr: '', stdout };
    };
    const result = runColdStartExperiment({ apply: true, runAdb, snapshot: () => snapshot(listeningPort) });

    expect(result.selectedPort).toBe(5037);
    expect(listeningPort).toBe(5037);
    expect(commands.filter((item) => item.endsWith('start-server'))).toEqual([
      '-P 5037 start-server', '-P 5601 start-server', '-P 5037 start-server'
    ]);
    expect(result.results.every((item) => item.transports[0].serial === EXPECTED_A5_SERIAL)).toBe(true);
  });
});
