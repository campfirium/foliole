import { afterEach, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';

import {
  getWorkspaceRailSectionItems,
  normalizeWorkspaceRailItems,
  toggleWorkspaceRailItemVisibility
} from './workspaceRailSettings';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('adds the SuperMemo shortcut to existing internal desktop layouts and preserves a hidden shortcut across builds', () => {
  vi.stubGlobal('electronAPI', { invoke: vi.fn() });
  vi.stubEnv('MODE', 'production');
  const publicItems = normalizeWorkspaceRailItems();
  const getShortcut = (items: typeof publicItems) => getWorkspaceRailSectionItems(items, 'top')
    .find(item => item.commandId === APP_COMMAND_IDS.importSuperMemo);

  expect(getShortcut(publicItems)).toBeUndefined();
  vi.stubEnv('MODE', 'internal');
  const shortcut = getShortcut(publicItems);
  expect(shortcut).toMatchObject({ iconId: 'DatabaseBackup', visible: true });

  const hiddenItems = toggleWorkspaceRailItemVisibility(normalizeWorkspaceRailItems(publicItems), shortcut!.id, false);
  vi.stubEnv('MODE', 'production');
  expect(getShortcut(hiddenItems)).toBeUndefined();
  const savedInPublic = normalizeWorkspaceRailItems(hiddenItems);
  vi.stubEnv('MODE', 'internal');
  expect(getShortcut(savedInPublic)?.visible).toBe(false);

  vi.unstubAllGlobals();
  expect(getShortcut(savedInPublic)).toBeUndefined();
});
