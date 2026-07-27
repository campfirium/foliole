// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseMdnsEndpoints, reconnectAndroidDevice, resolveAndroidDevice, validateAndroidLabConfig } from './windows-android-lab-device.mjs';
import { androidLabPaths, readJson, writeJsonAtomic } from './windows-android-lab-state.mjs';

const roots = [];
const ENDPOINT = '192.168.0.107:38717';
const CONFIG = { adbPath: 'adb.exe', deviceIdentity: 'A5-STABLE', schemaVersion: 2 };
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-device-'));
  roots.push(root);
  return androidLabPaths(root);
}

function adbCommand(args) {
  return args[0] === '-P' ? args.slice(2) : args;
}

function adbExecutor({ devices = `${ENDPOINT}\tdevice\n`, identity = 'A5-STABLE', mdns = '' } = {}) {
  return async (_command, args) => {
    const adb = adbCommand(args);
    if (adb[0] === 'devices') return { code: 0, lines: [], output: devices };
    if (adb[0] === 'mdns') return { code: 0, lines: [], output: mdns };
    if (args.includes('getprop')) return { code: 0, lines: [identity], output: `${identity}\n` };
    return { code: 0, lines: [], output: `connected to ${adb.at(-1)}\n` };
  };
}

describe('Windows Android lab device contract', () => {
  it('rejects schema v1 explicitly', () => {
    expect(() => validateAndroidLabConfig({ schemaVersion: 1 })).toThrowError(expect.objectContaining({
      code: 'android_lab_config_upgrade_required'
    }));
  });

  it('persists only a verified stable identity and endpoint', async () => {
    const paths = fixture();
    await reconnectAndroidDevice(CONFIG, ENDPOINT, paths, adbExecutor());
    expect(readJson(paths.device)).toMatchObject({ endpoint: ENDPOINT, identity: 'A5-STABLE' });
    await expect(reconnectAndroidDevice(CONFIG, ENDPOINT, paths, adbExecutor({ identity: 'OTHER' }))).rejects.toMatchObject({
      code: 'device_identity_mismatch'
    });
  });

  it('uses mDNS only after the previous endpoint fails', async () => {
    const paths = fixture();
    writeJsonAtomic(paths.device, { endpoint: '192.168.0.107:40000', identity: 'A5-STABLE' });
    const calls = [];
    let connected = '';
    const executeCommand = async (_command, args) => {
      calls.push(args);
      const adb = adbCommand(args);
      if (adb[0] === 'devices') return { code: 0, lines: [], output: connected ? `${connected}\tdevice\n` : '' };
      if (adb[0] === 'mdns') return { code: 0, lines: [], output: `adb-A5 _adb-tls-connect._tcp. ${ENDPOINT}` };
      if (args.includes('getprop')) {
        const identity = adb[1] === ENDPOINT ? 'A5-STABLE' : 'OTHER';
        return { code: 0, lines: [identity], output: identity };
      }
      if (adb[0] === 'connect') connected = adb[1];
      return { code: 0, lines: [], output: 'connected' };
    };
    const device = await resolveAndroidDevice(CONFIG, paths, executeCommand);
    expect(device).toMatchObject({ discoverySource: 'mdns', endpoint: ENDPOINT });
    expect(calls.findIndex((args) => adbCommand(args)[0] === 'mdns')).toBeGreaterThan(calls.findIndex((args) => args.includes('getprop')));
    expect(calls.every((args) => args[0] === '-P' && args[1] === '5601')).toBe(true);
  });

  it('resolves a ready USB ADB serial without wireless reconnect', async () => {
    const paths = fixture();
    const calls = [];
    const executeCommand = async (_command, args) => {
      calls.push(args);
      const adb = adbCommand(args);
      if (adb[0] === 'devices') return { code: 0, lines: [], output: '87a33a4b\tdevice product:marble\n' };
      if (args.includes('getprop')) return { code: 0, lines: ['A5-STABLE'], output: 'A5-STABLE\n' };
      return { code: 0, lines: [], output: '' };
    };
    const device = await resolveAndroidDevice(CONFIG, paths, executeCommand);
    expect(device).toMatchObject({ discoverySource: 'usb', endpoint: '87a33a4b', identity: 'A5-STABLE' });
    expect(calls.some((args) => adbCommand(args)[0] === 'connect')).toBe(false);
    expect(calls.every((args) => args[0] === '-P' && args[1] === '5601')).toBe(true);
  });

  it('parses only valid IPv4 endpoints from mDNS output', () => {
    expect(parseMdnsEndpoints(`tls 192.168.0.107:38717\ninvalid 999.1.1.1:70000`)).toEqual([ENDPOINT]);
  });
});
