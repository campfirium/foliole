// @vitest-environment node
/* global process */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { bindSlot, resolveCurrentBinding, removeSlotBinding } from './thread-preview-slot/slotBinding.mjs';
import { createSlotClientEnv, ensureElectronDistInSlot } from './thread-preview-slot/slotClient.mjs';
import { paths, readState, resolveSafeSlotDir, validateSlotId } from './thread-preview-slot/slotCommon.mjs';
import { syncMissingLocalDependencies } from './thread-preview-slot/slotDependencies.mjs';
import { refreshLibrary } from './thread-preview-slot/slotLibrary.mjs';
import { acquireSlotPort, readSlotPort, releaseSlotPort } from './thread-preview-slot/slotPorts.mjs';
import { releaseSlot } from './thread-preview-slot/slotRelease.mjs';
import { resolvePreviewClientAction } from './thread-preview-slot/slotWorkspace.mjs';

let tempRoot = '';
let tempRepo = '';
const savedEnv = { ...process.env };

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-preview-root-'));
  tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-repo-'));
  process.env = {
    ...savedEnv,
    FOLIOLE_WINDOWS_MAIN_MIRROR: path.join(tempRoot, 'main-mirror'),
    FOLIOLE_PREVIEW_SLOT_SKIP_WINDOWS_PORT_CHECK: '1',
    FOLIOLE_PREVIEW_SLOT_ROOT: tempRoot,
    FOLIOLE_REPO_ROOT: tempRepo
  };
});

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
  fs.rmSync(tempRoot, { force: true, recursive: true });
  fs.rmSync(tempRepo, { force: true, recursive: true });
});

it('rejects path-like slot ids before resolving slot directories', () => {
  expect(() => validateSlotId('slot-a')).not.toThrow();
  for (const slot of ['.', '..', 'slot.a', 'slot/a', 'slot\\a', '']) {
    expect(() => validateSlotId(slot)).toThrow(/invalid slot id/u);
  }
  expect(resolveSafeSlotDir('slot-a')).toBe(path.join(tempRoot, 'slots', 'slot-a'));
});

it('stores thread bindings separately from fallback bindings', () => {
  bindSlot('slot-a', { label: '外链预览', thread: 'thread-1' });
  expect(resolveCurrentBinding('thread-1')).toMatchObject({ label: '外链预览', slot: 'slot-a' });

  bindSlot('slot-b', { label: '导入修复' });
  expect(resolveCurrentBinding()).toMatchObject({ label: '导入修复', slot: 'slot-b' });

  removeSlotBinding('slot-a');
  expect(resolveCurrentBinding('thread-1')).toBeNull();
});

it('keeps empty libraries inside the slot tmp directory and requires explicit refresh sources', () => {
  const p = paths('slot-a');
  expect(p.libraryDir).toBe(path.join(tempRoot, 'slots', 'slot-a', '.tmp', 'library'));
  expect(p.userDataDir).toBe(path.join(tempRoot, 'slots', 'slot-a', '.tmp', 'electron-user-data'));
  expect(() => refreshLibrary('slot-a', '')).toThrow(/requires explicit --from/u);
});

it('injects slot library, user data, label and strict Vite port env', () => {
  const { env } = createSlotClientEnv('slot-a', 'start', {
    FOLIOLE_PREVIEW_LABEL: '外链预览',
    FOLIOLE_VITE_PORT: '24609',
    FOLIOLE_VITE_PORT_STRICT: '1'
  });
  expect(env.FOLIOLE_NATIVE_LIBRARY_HOME).toContain('slots\\slot-a\\.tmp\\library');
  expect(env.FOLIOLE_NATIVE_USER_DATA_PATH).toContain('slots\\slot-a\\.tmp\\electron-user-data');
  expect(env.FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY).toBe('1');
  expect(env.FOLIOLE_PREVIEW_LABEL).toBe('外链预览');
  expect(env.FOLIOLE_VITE_PORT).toBe('24609');
  expect(env.FOLIOLE_DEV_SCREENSHOT_PORT).toBe('38651');
  expect(env.WSLENV).toContain('FOLIOLE_PREVIEW_LABEL/w');
  expect(env.WSLENV).toContain('FOLIOLE_DEV_SCREENSHOT_PORT');
  expect(env.WSLENV).toContain('FOLIOLE_VITE_PORT_STRICT');
});

it('uses a full shell restart when the preview label changes', () => {
  expect(resolvePreviewClientAction({
    labelChanged: true,
    requiresRuntimeRestart: false,
    requiresShellRestart: false,
    running: true
  })).toBe('full-restart');
  expect(resolvePreviewClientAction({
    labelChanged: false,
    requiresRuntimeRestart: false,
    requiresShellRestart: false,
    running: true
  })).toBe('status');
});

it('copies electron-dist from the main mirror when a renderer-only slot lacks a runtime bundle', () => {
  const p = paths('slot-a');
  const mirrorMain = path.join(p.mainMirrorDir, 'electron-dist', 'electron', 'main.js');
  fs.mkdirSync(path.dirname(mirrorMain), { recursive: true });
  fs.writeFileSync(mirrorMain, 'console.log("main");\n');
  fs.mkdirSync(p.slotDir, { recursive: true });

  expect(ensureElectronDistInSlot('slot-a')).toBe('copied');
  expect(fs.readFileSync(path.join(p.slotDir, 'electron-dist', 'electron', 'main.js'), 'utf8')).toContain('main');
});

it('copies missing relative source dependencies from the shared worktree into the slot', () => {
  const p = paths('slot-a');
  const repoIndex = path.join(tempRepo, 'src', 'shared', 'ui', 'index.ts');
  const repoShellless = path.join(tempRepo, 'src', 'shared', 'ui', 'ShelllessSurface.ts');
  const repoSurfaceControl = path.join(tempRepo, 'src', 'shared', 'ui', 'SurfaceControl.ts');
  fs.mkdirSync(path.dirname(repoIndex), { recursive: true });
  fs.writeFileSync(repoIndex, "export { shellless } from './ShelllessSurface';\n");
  fs.writeFileSync(repoShellless, "import { control } from './SurfaceControl';\nexport const shellless = control;\n");
  fs.writeFileSync(repoSurfaceControl, 'export const control = true;\n');

  const slotIndex = path.join(p.slotDir, 'src', 'shared', 'ui', 'index.ts');
  fs.mkdirSync(path.dirname(slotIndex), { recursive: true });
  fs.copyFileSync(repoIndex, slotIndex);

  expect(syncMissingLocalDependencies('slot-a', ['src/shared/ui/index.ts'])).toEqual([
    'src/shared/ui/ShelllessSurface.ts',
    'src/shared/ui/SurfaceControl.ts'
  ]);
  expect(fs.existsSync(path.join(p.slotDir, 'src', 'shared', 'ui', 'ShelllessSurface.ts'))).toBe(true);
  expect(fs.existsSync(path.join(p.slotDir, 'src', 'shared', 'ui', 'SurfaceControl.ts'))).toBe(true);
});

it('syncs alias, stale barrel and css import preview dependencies from the shared worktree', () => {
  const p = paths('slot-a');
  const repoHeader = path.join(tempRepo, 'src', 'app', 'components', 'Header.tsx');
  const repoIndex = path.join(tempRepo, 'src', 'shared', 'ui', 'index.ts');
  const repoShellless = path.join(tempRepo, 'src', 'shared', 'ui', 'ShelllessSurface.ts');
  const repoStyles = path.join(tempRepo, 'src', 'app', 'styles.css');
  const repoShelllessCss = path.join(tempRepo, 'src', 'app', 'tokens', 'shellless-surfaces.css');
  fs.mkdirSync(path.dirname(repoHeader), { recursive: true });
  fs.mkdirSync(path.dirname(repoIndex), { recursive: true });
  fs.mkdirSync(path.dirname(repoShelllessCss), { recursive: true });
  fs.writeFileSync(repoHeader, "import { appShelllessSurfaceClassName } from '@/shared/ui';\n");
  fs.writeFileSync(repoIndex, "export { appShelllessSurfaceClassName } from './ShelllessSurface';\n");
  fs.writeFileSync(repoShellless, 'export const appShelllessSurfaceClassName = () => "shellless";\n');
  fs.writeFileSync(repoStyles, '@import "./tokens/shellless-surfaces.css";\n');
  fs.writeFileSync(repoShelllessCss, ':root { --app-shellless-surface-bg: white; }\n');

  const slotHeader = path.join(p.slotDir, 'src', 'app', 'components', 'Header.tsx');
  const slotIndex = path.join(p.slotDir, 'src', 'shared', 'ui', 'index.ts');
  const slotStyles = path.join(p.slotDir, 'src', 'app', 'styles.css');
  fs.mkdirSync(path.dirname(slotHeader), { recursive: true });
  fs.mkdirSync(path.dirname(slotIndex), { recursive: true });
  fs.copyFileSync(repoHeader, slotHeader);
  fs.writeFileSync(slotIndex, 'export const stale = true;\n');
  fs.copyFileSync(repoStyles, slotStyles);

  expect(syncMissingLocalDependencies('slot-a', ['src/app/components/Header.tsx'])).toEqual([
    'src/app/tokens/shellless-surfaces.css',
    'src/shared/ui/ShelllessSurface.ts',
    'src/shared/ui/index.ts'
  ]);
  expect(syncMissingLocalDependencies('slot-a', ['src/app/components/Header.tsx'])).toEqual([
    'src/app/tokens/shellless-surfaces.css',
    'src/shared/ui/ShelllessSurface.ts',
    'src/shared/ui/index.ts'
  ]);
  expect(fs.readFileSync(slotIndex, 'utf8')).toContain('ShelllessSurface');
  expect(fs.existsSync(path.join(p.slotDir, 'src', 'shared', 'ui', 'ShelllessSurface.ts'))).toBe(true);
  expect(fs.existsSync(path.join(p.slotDir, 'src', 'app', 'tokens', 'shellless-surfaces.css'))).toBe(true);
});

it('allocates, reuses and releases a registry port per slot', async () => {
  const first = await acquireSlotPort('slot-a', { label: '外链预览', thread: 'thread-1' });
  const second = await acquireSlotPort('slot-b', { label: '导入修复', thread: 'thread-2' });
  expect(second).not.toBe(first);
  expect(await acquireSlotPort('slot-a')).toBe(first);

  releaseSlotPort('slot-a');
  expect(readSlotPort('slot-a')).toBeNull();
  expect(readSlotPort('slot-b')).toBe(second);
});

it('release is idempotent for missing slots and clears registry state', async () => {
  bindSlot('slot-a', { label: '外链预览', thread: 'thread-1' });
  const port = await acquireSlotPort('slot-a', { label: '外链预览', thread: 'thread-1' });
  expect(port).toBeGreaterThan(0);

  await releaseSlot('slot-a');

  expect(readSlotPort('slot-a')).toBeNull();
  expect(resolveCurrentBinding('thread-1')).toBeNull();
  expect(fs.existsSync(paths('slot-a').runtimeDir)).toBe(false);
  expect(readState('slot-a').slot).toBe('slot-a');
});
