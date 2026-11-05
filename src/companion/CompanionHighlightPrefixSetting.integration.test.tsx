import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { getHighlightAnnotationPrefix } from '../shared/config/highlightAnnotationPrefixSetting';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { getSelectionCommandPayloadForContentRanges } from '../shared/selectionCommandPayload';

import { persistCompanionSelectionAnnotation } from './companionSelectionAnnotationActions';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';

const runtime = vi.hoisted(() => ({ platform: 'android' }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => runtime.platform, isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

const title = 'Highlight annotation prefix';
const key = APP_SETTINGS_STORAGE_KEYS.highlightAnnotationPrefix;
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const content = 'Selected passage and surrounding context.';
const payload = getSelectionCommandPayloadForContentRanges('source', content, [{ from: 0, to: 16 }])!;

beforeEach(async () => {
  window.localStorage.clear();
  library = await createSearchLibrary(0);
  library.database.prepare(`INSERT INTO nodes (id,title,content,created_at,updated_at)
    VALUES ('source','Source',?,'2026-11-05','2026-11-05')`).run(content);
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

function mountSettings() {
  return renderWithLocalization(renderCompanionSettingsContent({ settingsPage: 'list',
    onBackToSettingsList() {}, onOpenSyncSettings() {}, onOpenSyncSettingsPage() {},
    workspaceSync: {} as never }));
}

function openSetting() {
  fireEvent.click(screen.getByRole('button', { name: title, exact: true }));
  return screen.getByRole('textbox', { name: title });
}

function changeSetting(value: string) {
  const input = openSetting();
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form')!);
}

async function createNote(note: string) {
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  return persistCompanionSelectionAnnotation({ deviceId: 'Search', kind: 'note', payload, note, snapshot });
}

it.each(['android', 'ios'])('uses the %s setting in persisted quick annotations and retains it after reopening', async platform => {
  runtime.platform = platform;
  const ui = mountSettings();
  expect(openSetting()).toHaveValue('※ ');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const original = await createNote('First');
  expect(await loadCompanionWorkspaceNode(original!.nodeId)).toMatchObject({ content: 'Selected passage\n※ First' });
  changeSetting('Note: ');
  expect(window.localStorage.getItem(key)).toBe('Note: ');
  expect(await loadCompanionWorkspaceNode(original!.nodeId)).toMatchObject({ content: 'Selected passage\n※ First' });
  const next = await createNote('Custom');
  expect(await loadCompanionWorkspaceNode(next!.nodeId)).toMatchObject({ content: 'Selected passage\nNote: Custom' });
  ui.unmount();
  library.database = (await reopenSearchLibrary(library.root, '2026-11-05T12:00:00Z')).db;
  mountSettings();
  expect(openSetting()).toHaveValue('Note: ');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const after = await createNote('Reopened');
  expect(await loadCompanionWorkspaceNode(after!.nodeId)).toMatchObject({ content: 'Selected passage\nNote: Reopened' });
  expect((await loadCompanionWorkspaceNode('source'))?.content).toBe(content);
});

it.each([['', '※ '], ['A\r\nB', 'AB'], ['x'.repeat(30), 'x'.repeat(24)]])(
  'normalizes %j with the desktop rules', (value, expected) => {
    mountSettings(); changeSetting(value!);
    expect(getHighlightAnnotationPrefix()).toBe(expected);
  });

it('keeps canceled drafts private and resets only when confirmed', () => {
  mountSettings(); changeSetting('Note: ');
  const input = openSetting();
  fireEvent.change(input, { target: { value: 'Draft: ' } });
  fireEvent.blur(input);
  expect(getHighlightAnnotationPrefix()).toBe('Note: ');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(openSetting()).toHaveValue('Note: ');
  fireEvent.click(screen.getByRole('button', { name: 'Reset highlight annotation prefix' }));
  expect(screen.getByRole('textbox')).toHaveValue('※ ');
  expect(getHighlightAnnotationPrefix()).toBe('Note: ');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(getHighlightAnnotationPrefix()).toBe('※ ');
});

it('keeps the old setting and new draft when saving fails, then retries', async () => {
  mountSettings(); changeSetting('Note: ');
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  changeSetting('>> ');
  expect(screen.getByRole('alert')).toHaveTextContent('Changes could not be saved');
  expect(getHighlightAnnotationPrefix()).toBe('Note: ');
  expect(screen.getByRole('textbox')).toHaveValue('>> ');
  save.mockRestore();
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry' })); });
  expect(getHighlightAnnotationPrefix()).toBe('>> ');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('reports an unreadable setting without overwriting it and supports retry', () => {
  const original = Storage.prototype.getItem;
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, name) {
    if (name === key) throw new Error('Blocked');
    return original.call(this, name);
  });
  mountSettings(); fireEvent.click(screen.getByRole('button', { name: title }));
  expect(screen.getByRole('alert')).toHaveTextContent('Annotation prefix could not be loaded');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  read.mockRestore(); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getByRole('textbox')).toHaveValue('※ ');
  expect(window.localStorage.getItem(key)).toBeNull();
});
