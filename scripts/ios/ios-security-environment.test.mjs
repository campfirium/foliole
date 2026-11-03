// @vitest-environment node
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { collectIosEnvironment, qualifyIosDeviceEnvironment } from './ios-security-environment.mjs';

function details(udid = 'selected-iphone') {
  return { result: { deviceProperties: { name: 'Test iPhone', osVersionNumber: '27.0.1', osBuildUpdate: '24A446' },
    hardwareProperties: { udid } } };
}

it('rejects device collection without a target before invoking any native command', () => {
  const calls = [];
  expect(() => collectIosEnvironment({ root: process.cwd(), inventory: {}, device: true,
    run: (...args) => { calls.push(args); return ''; } })).toThrow('explicit device ID');
  expect(calls).toEqual([]);
});

it('qualifies only the explicitly selected identity and requires its observed OS', () => {
  expect(qualifyIosDeviceEnvironment(details(), { deviceId: 'selected-iphone' }))
    .toMatchObject({ device: 'Test iPhone', os: '27.0.1' });
  expect(() => qualifyIosDeviceEnvironment(details('other'), { deviceId: 'selected-iphone' })).toThrow('identity');
  expect(() => qualifyIosDeviceEnvironment(details(), { deviceId: 'selected-iphone', deviceName: 'Another phone' }))
    .toThrow('identity');
  const missing = details();
  delete missing.result.deviceProperties.osVersionNumber;
  expect(() => qualifyIosDeviceEnvironment(missing, { deviceId: 'selected-iphone' })).toThrow('OS version');
});

it('rejects the old implicit-device CLI before scanner or network work', () => {
  const result = spawnSync(process.execPath, ['scripts/ios/ios-security-maintenance.mjs', 'unused', '--device'],
    { encoding: 'utf8', timeout: 10_000 });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Usage:');
});

it('queries only the explicit device and preserves mismatched identity as an error', () => {
  if (process.platform !== 'darwin') return;
  const calls = [];
  const collect = (value) => collectIosEnvironment({ root: process.cwd(), inventory: {}, device: true,
    deviceId: 'selected-iphone', run: (command, args) => {
      calls.push([command, args]);
      return args.includes('devicectl') ? JSON.stringify(value) : 'version';
    } });
  expect(collect(details()).device).toMatchObject({ status: 'observed', device: 'Test iPhone' });
  expect(calls.filter(([, args]) => args.includes('devicectl'))[0][1])
    .toContain('selected-iphone');
  expect(collect(details('wrong')).device.status).toBe('error');
});
