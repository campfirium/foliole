// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { runWindowsDesktopDnsSdRouteController } from
  './windows-desktop-dnssd-route-controller.mjs';

it('binds the route worker to the prepared runtime and finalizes cleanup on success', async () => {
  const runtime = { receiptPath: 'runtime.json', taskCopy: { sourceRoot: 'owned/source' } };
  const deviceAction = vi.fn(async (options) => ({
    desktopDnsSdRouteProvider: { manifestPath: options.runtimeRepoRoot }, output: ''
  }));
  const finishRuntime = vi.fn(() => ({ cleanup: { resultStatus: 'complete' } }));
  const result = await runWindowsDesktopDnsSdRouteController({
    action: 'desktop-dnssd-route-provider', deviceAction
  }, { finishRuntime, prepareRuntime: vi.fn(async () => runtime) });
  expect(deviceAction).toHaveBeenCalledWith(expect.objectContaining({
    runtimeRepoRoot: runtime.taskCopy.sourceRoot
  }));
  expect(finishRuntime).toHaveBeenCalledWith(runtime, undefined);
  expect(result.desktopDnsSdRouteRuntime.receiptPath).toBe(runtime.receiptPath);
});

it('finalizes the owned runtime with the worker failure before rethrowing', async () => {
  const failure = new Error('worker failed');
  const runtime = { taskCopy: { sourceRoot: 'owned/source' } };
  const finishRuntime = vi.fn((_runtime, error) => { throw error; });
  await expect(runWindowsDesktopDnsSdRouteController({
    action: 'desktop-dnssd-route-provider', deviceAction: vi.fn(async () => { throw failure; })
  }, { finishRuntime, prepareRuntime: vi.fn(async () => runtime) })).rejects.toThrow('worker failed');
  expect(finishRuntime).toHaveBeenCalledWith(runtime, failure);
});
