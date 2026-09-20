// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type * as Bootstrap from './companionBootstrap';
import type * as Capabilities from './companionRuntimeCapabilities';
import type * as Repository from './companionWorkspaceRuntimeRepository';

type Header = { name: string; methods: { name: string; rtype: string }[] };
const coreSource = readFileSync(createRequire(import.meta.url).resolve('@capacitor/core'), 'utf8');
const unavailable = { code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE' };

function loadProduction<T>(name: string, resolve: (name: string) => unknown): T {
  const path = `src/shared/platform/${name}.ts`;
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: resolve }, { filename: path });
  return exports as T;
}

function createHost(platform: string, headers: Header[] = [], failure?: Error) {
  const calls: unknown[] = [];
  const exports = {} as typeof import('@capacitor/core');
  const context = {
    exports,
    Capacitor: {
      PluginHeaders: headers,
      nativePromise(plugin: string, method: string, args: unknown) {
        calls.push({ plugin, method, args });
        return failure ? Promise.reject(failure) : Promise.resolve({ run_id: 'run-1' });
      }
    },
    ...(platform === 'android' ? { androidBridge: {} } : {}),
    ...(platform === 'ios' ? { webkit: { messageHandlers: { bridge: {} } } } : {}),
    ...(platform === 'unsupported' ? { CapacitorCustomPlatform: { name: platform } } : {})
  };
  vm.runInNewContext(coreSource, context);
  const capabilities = loadProduction<typeof Capabilities>('companionRuntimeCapabilities', () => exports);
  const resolve = (name: string) => {
    if (name === '@capacitor/core') return exports;
    if (name === './companionRuntimeCapabilities') return capabilities;
    throw new Error(`Unexpected dependency: ${name}`);
  };
  return {
    calls, capabilities, core: exports,
    repository: loadProduction<typeof Repository>('companionWorkspaceRuntimeRepository', resolve),
    bootstrap: loadProduction<typeof Bootstrap>('companionBootstrap', resolve)
  };
}

function header(name: string, method?: string): Header {
  return { name, methods: method ? [{ name: method, rtype: 'promise' }] : [] };
}

describe.each(['android', 'ios', 'web', 'unsupported'])('%s capability contract', (platform) => {
  it('rejects unknown names and retains declared host distinctions', () => {
    const { capabilities: c, calls } = createHost(platform);
    for (const name of ['', 'typo-unknown', 'toString', '__proto__', 'Bootstrap']) {
      expect(c.isCompanionRuntimeCapabilityAvailable(name)).toBe(false);
      expect(() => c.requireAvailableCompanionRuntime(name)).toThrowError(expect.objectContaining(unavailable));
    }
    for (const name of c.COMPANION_CAPABILITY_NAMES) {
      const expected = platform !== 'unsupported' && !(platform === 'ios' && name === 'native-runtime');
      expect(c.isCompanionRuntimeCapabilityAvailable(name)).toBe(expected);
    }
    expect(calls).toEqual([]);
  });

  it('rejects a missing sync plugin despite the callable JS proxy', () => {
    const h = createHost(platform);
    expect(typeof h.repository.FolioleCompanionSync.beginSyncRun).toBe('function');
    expect(() => h.repository.beginNativeCompanionSyncRun('manual', 'run-1'))
      .toThrowError(expect.objectContaining(unavailable));
    expect(h.calls).toEqual([]);
  });
});

describe.each(['android', 'ios'])('%s native plugin boundary', (platform) => {
  it('routes supported sync calls without reflection', async () => {
    const h = createHost(platform, [header('FolioleCompanionSync', 'beginSyncRun')]);
    expect(Object.hasOwn(h.repository.FolioleCompanionSync, 'beginSyncRun')).toBe(false);
    await expect(h.repository.beginNativeCompanionSyncRun('manual', 'run-1')).resolves.toEqual({ run_id: 'run-1' });
    expect(h.calls).toEqual([{ plugin: 'FolioleCompanionSync', method: 'beginSyncRun',
      args: { reason: 'manual', run_id: 'run-1' } }]);
  });

  it('keeps Capacitor UNIMPLEMENTED when a registered plugin lacks the method', async () => {
    const h = createHost(platform, [header('FolioleCompanionSync')]);
    await expect(h.repository.beginNativeCompanionSyncRun('manual', 'run-1'))
      .rejects.toMatchObject({ code: 'UNIMPLEMENTED' });
    expect(h.calls).toEqual([]);
  });

  it('propagates the original native failure', async () => {
    const failure = Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
    const h = createHost(platform, [header('FolioleCompanionSync', 'beginSyncRun')], failure);
    await expect(h.repository.beginNativeCompanionSyncRun('manual', 'run-1')).rejects.toBe(failure);
  });

  it('keeps SQLite reading and writing declarations independent of Sync installation', () => {
    const h = createHost(platform);
    expect(h.core.Capacitor.isPluginAvailable('FolioleCompanionSync')).toBe(false);
    expect(h.repository.isNativeCompanionReadingWriteRuntime()).toBe(true);
    expect(h.repository.isNativeCompanionReviewWriteRuntime()).toBe(true);
    expect(h.repository.isNativeCompanionNodeVersionWriteRuntime()).toBe(true);
    expect(h.capabilities.requireAvailableCompanionRuntime('sync-pack-apply').platform).toBe(platform);
  });

  it('rejects missing bootstrap plugins before database initialization', async () => {
    const h = createHost(platform);
    await expect(h.bootstrap.loadCompanionBootstrapState()).rejects.toMatchObject({ ...unavailable, capability: 'bootstrap' });
    expect(h.calls).toEqual([]);
  });

  it('preserves missing bootstrap method and operational failures', async () => {
    const h = createHost(platform, [header('FolioleCompanionBootstrap')]);
    await expect(h.bootstrap.loadCompanionBootstrapState()).rejects.toMatchObject({ code: 'UNIMPLEMENTED' });
    const failure = Object.assign(new Error('Storage unavailable'), { code: 'STORAGE_UNAVAILABLE' });
    const failing = createHost(platform, [header('FolioleCompanionBootstrap', 'loadBootstrap')], failure);
    await expect(failing.bootstrap.loadCompanionBootstrapState()).rejects.toBe(failure);
  });
});

it('keeps browser bootstrap diagnostic without permitting native plugin invocation', async () => {
  const h = createHost('web', [header('FolioleCompanionBootstrap', 'loadBootstrap')]);
  await expect(h.bootstrap.loadCompanionBootstrapState()).resolves.toMatchObject({
    runtime_kind: 'web-preview', database_ready: false
  });
  expect(() => h.capabilities.requireCompanionNativePlugin('bootstrap', 'FolioleCompanionBootstrap'))
    .toThrowError(expect.objectContaining(unavailable));
  expect(h.calls).toEqual([]);
});
