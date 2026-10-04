import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

test('switches Library Home through the native bridge and keeps persisted settings', async ({ desktopWindow }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-home-native-'));
  const target = path.join(root, 'LibraryNext');
  try {
    const original = await desktopWindow.evaluate(() => window.electronAPI.invoke('load_library_path_settings', {})) as {
      library_home: string; database_path: string
    };
    const settings = await desktopWindow.evaluate(() => window.electronAPI.invoke('load_app_settings_state', {}));
    const result = await desktopWindow.evaluate((target) => window.electronAPI.invoke('update_library_path_setting', {
      location: 'library_home', path: target
    }), target);
    expect(result).toMatchObject({ library_home: target, database_path: path.join(target, 'Data', 'foliole.db') });
    expect(await desktopWindow.evaluate(() => window.electronAPI.invoke('load_app_settings_state', {}))).toEqual(settings);
    await expect(fs.access(original.database_path)).rejects.toThrow();
    await desktopWindow.evaluate(() => window.electronAPI.invoke('update_library_path_setting', {
      location: 'library_home', path: null
    }));
    expect(await desktopWindow.evaluate(() => window.electronAPI.invoke('load_library_path_settings', {})))
      .toMatchObject({ library_home: original.library_home });
    expect(await desktopWindow.evaluate(() => window.electronAPI.invoke('load_app_settings_state', {}))).toEqual(settings);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
