import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadFoliolePublishTheme, openFoliolePublishCustomTheme, useFoliolePublishTheme } from './foliolePublish.js';

const state = vi.hoisted(() => ({ libraryHome: '' }));
const shellOpenPath = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ shell: { openExternal: vi.fn(), openPath: shellOpenPath } }));
vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: state.libraryHome })
}));

beforeEach(() => {
  state.libraryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-theme-runtime-'));
  shellOpenPath.mockReset().mockResolvedValue('');
});

afterEach(() => fs.rmSync(state.libraryHome, { force: true, recursive: true }));

it('switches to Foliole Theme without deleting Custom Theme', async () => {
  const custom = await openFoliolePublishCustomTheme();
  const style = path.join(custom.local_path, 'style.css');
  fs.writeFileSync(style, 'custom theme');

  expect(loadFoliolePublishTheme().active_theme).toBe('custom');
  expect(useFoliolePublishTheme().theme.active_theme).toBe('foliole');
  expect(fs.readFileSync(style, 'utf8')).toBe('custom theme');
});

it('does not activate Custom Theme when its folder cannot be opened', async () => {
  shellOpenPath.mockResolvedValue('Folder access failed.');
  await expect(openFoliolePublishCustomTheme()).rejects.toThrow('Folder access failed.');
  expect(loadFoliolePublishTheme()).toMatchObject({
    active_theme: 'foliole', custom_theme: { based_on_official_version: 4 }
  });
});
