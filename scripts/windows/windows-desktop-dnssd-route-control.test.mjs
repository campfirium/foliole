// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { runWindowsDesktopDnsSdRouteControl } from
  './windows-desktop-dnssd-route-control.mjs';

function options(action) {
  return { action, deviceAction: vi.fn(async () => ({ output: 'route' })), evidenceRoot: 'evidence',
    execute: vi.fn(), paths: {}, snapshotRuntime: vi.fn(async () => []) };
}

it('collects host facts without suspending or starting the product runtime', async () => {
  const route = options('desktop-dnssd-host-facts');
  const runHostFacts = vi.fn(async () => ({
    evidence: { schemaVersion: 1 }, manifestPath: 'host-facts.json', output: ''
  }));
  const suspend = vi.fn();
  await expect(runWindowsDesktopDnsSdRouteControl(route, {
    runHostFacts, suspend
  })).resolves.toEqual({
    desktopDnsSdHostFacts: { schemaVersion: 1 },
    manifestPath: 'host-facts.json', output: ''
  });
  expect(runHostFacts).toHaveBeenCalledWith(
    'desktop-dnssd-host-facts', route.execute, route.paths, route.evidenceRoot
  );
  expect(suspend).not.toHaveBeenCalled();
  expect(route.deviceAction).not.toHaveBeenCalled();
});

it('stops the fixed client, prepares once, and restores its prior state', async () => {
  const route = options('desktop-dnssd-route-prepare');
  const prepare = vi.fn(async () => ({ output: 'prepared' }));
  const suspend = vi.fn(async () => true);
  const restore = vi.fn(async () => {});
  const result = await runWindowsDesktopDnsSdRouteControl(route, {
    prepare, restore, suspend
  });
  expect(result).toEqual({ output: 'prepared' });
  expect(prepare).toHaveBeenCalledWith(route);
  expect(route.deviceAction).not.toHaveBeenCalled();
  expect(restore).toHaveBeenCalledWith(expect.objectContaining({ suspended: true }));
});

it('reuses the prepared runtime before starting the mature product action', async () => {
  const route = options('desktop-dnssd-route-selfcheck');
  const assertPrepared = vi.fn(async () => ({ resultStatus: 'success' }));
  const runSelfcheck = vi.fn(async () => ({ output: 'selfcheck' }));
  const result = await runWindowsDesktopDnsSdRouteControl(route, {
    assertPrepared, restore: vi.fn(), runSelfcheck, suspend: vi.fn(async () => false)
  });
  expect(assertPrepared).toHaveBeenCalledWith(route);
  expect(runSelfcheck).toHaveBeenCalledWith(route);
  expect(route.deviceAction).not.toHaveBeenCalled();
  expect(result).toEqual({ output: 'selfcheck' });
});

it('routes provider execution through the existing device action', async () => {
  const route = options('desktop-dnssd-route-provider');
  await runWindowsDesktopDnsSdRouteControl(route, {
    assertPrepared: vi.fn(), restore: vi.fn(), suspend: vi.fn(async () => false)
  });
  expect(route.deviceAction).toHaveBeenCalledWith(route);
});

it('rejects remaining occupants before any runtime write and still restores', async () => {
  const route = options('desktop-dnssd-route-prepare');
  route.snapshotRuntime.mockResolvedValue([{ Name: 'electron.exe' }]);
  const prepare = vi.fn();
  const restore = vi.fn(async () => {});
  await expect(runWindowsDesktopDnsSdRouteControl(route, {
    prepare, restore, suspend: vi.fn(async () => true)
  })).rejects.toMatchObject({ exitCode: 73, stage: 'runtime-occupied' });
  expect(prepare).not.toHaveBeenCalled();
  expect(restore).toHaveBeenCalledWith(expect.objectContaining({ suspended: true }));
});
