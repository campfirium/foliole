import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS as keys } from '../shared/config/appSettings';
import { getLongClozeFrontGuardMode, getLongClozeFrontGuardThreshold, getLongClozeSelectionGuardMin } from '../shared/config/longClozeFrontGuardSetting';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { getSelectionCommandPayloadForContentRanges } from '../shared/selectionCommandPayload';

import { createCompanionSelectionAnnotationHandler } from './companionSelectionAnnotationController';
import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';
import { renderCompanionSettingsContent } from './CompanionSettingsShellContent';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

const selectionTitle = 'Only check when selected answer is longer than';
const frontTitle = 'Then guard when generated card front is longer than';
const modeTitle = 'Long cloze mistake guard';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const answer = 'Selected answer';
const content = `${answer} ${'Original context. '.repeat(45)}`;
const payload = getSelectionCommandPayloadForContentRanges('source', content, [{ from: 0, to: answer.length }])!;

beforeEach(async () => {
  window.localStorage.clear();
  library = await createSearchLibrary(0);
  library.database.prepare(`INSERT INTO nodes (id,title,content,created_at,updated_at)
    VALUES ('source','Source',?,'2026-11-05','2026-11-05')`).run(content);
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

function SettingsEntry() {
  const [settingsPage, setSettingsPage] = useState<CompanionSettingsPage>('list');
  return renderCompanionSettingsContent({ settingsPage, onBackToSettingsList: () => setSettingsPage('list'),
    onOpenSyncSettings: () => setSettingsPage('sync'), onOpenSyncSettingsPage: setSettingsPage,
    workspaceSync: {} as never });
}

function mountSettings() {
  const ui = renderWithLocalization(<SettingsEntry />);
  fireEvent.click(screen.getByRole('button', { name: 'Cloze guard' }));
  return ui;
}

function openSetting(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }));
  return screen.getByRole(title === modeTitle ? 'combobox' : 'spinbutton');
}

function changeSetting(title: string, value: string) {
  const input = openSetting(title);
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form')!);
}

async function createFromToolbar(choice?: string) {
  const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
  const handle = createCompanionSelectionAnnotationHandler({ bootstrapState: { device_id: 'Search' },
    state: { workspace_snapshot: snapshot }, refreshAfterMutation: async () => {} } as never);
  const close = vi.fn();
  const ui = renderWithLocalization(<CompanionSelectionAnnotationToolbar
    onApply={async (...args) => { await handle(...args); }} onClose={close}
    onAddExistingHighlightNote={vi.fn()} onDeleteExistingHighlight={vi.fn()}
    state={{ left: 12, top: 12, noteLeft: 12, noteTop: 52, payload }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cloze', exact: true }));
  if (choice) fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: choice, exact: true }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  ui.unmount();
  const rows = library.database.prepare("SELECT id,kind FROM nodes WHERE parent_id='source'").all() as { id: string; kind: string }[];
  return rows;
}

it('saves from the settings home, uses all three fields in actual creation and retains them across reopening', async () => {
  const ui = mountSettings();
  expect(screen.getByRole('button', { name: `${selectionTitle} 20` })).toBeInTheDocument();
  changeSetting(selectionTitle, '0');
  changeSetting(frontTitle, '600');
  changeSetting(modeTitle, 'convert');
  expect(getLongClozeFrontGuardMode()).toBe('convert');
  expect(getLongClozeSelectionGuardMin()).toBe(0);
  expect(getLongClozeFrontGuardThreshold()).toBe(600);
  ui.unmount();
  expect((await createFromToolbar()).map(row => row.kind)).toEqual(['topic']);
  library.database = (await reopenSearchLibrary(library.root, '2026-11-05T11:00:00Z')).db;
  const reopened = mountSettings();
  expect(openSetting(modeTitle)).toHaveValue('convert');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(openSetting(selectionTitle)).toHaveValue(0);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(openSetting(frontTitle)).toHaveValue(600);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  reopened.unmount();
  const rows = await createFromToolbar();
  expect(rows.map(row => row.kind)).toEqual(['topic', 'topic']);
  for (const row of rows) expect(await loadCompanionWorkspaceNode(row.id)).toMatchObject({ content: answer,
    reveal: null, anchorLink: { kind: 'highlight', locator: { from: 0, to: answer.length, originalText: answer } } });
  expect((await loadCompanionWorkspaceNode('source'))?.content).toBe(content);
  expect(library.database.prepare('SELECT * FROM node_review').all()).toEqual([]);
});

it('uses the saved front limit to allow a normal cloze with its learning state', async () => {
  const ui = mountSettings();
  changeSetting(selectionTitle, '0'); changeSetting(frontTitle, '2000'); changeSetting(modeTitle, 'convert');
  ui.unmount();
  const rows = await createFromToolbar();
  expect(rows).toHaveLength(1);
  expect(await loadCompanionWorkspaceNode(rows[0]!.id)).toMatchObject({ kind: 'item', content: payload.clozeContent.trim(), reveal: answer });
  expect(library.database.prepare('SELECT * FROM node_review').all()).toHaveLength(1);
});

it.each([
  [modeTitle, keys.longClozeFrontGuardMode, 'convert', 'remind', getLongClozeFrontGuardMode],
  [selectionTitle, keys.longClozeFrontGuardSelectionMin, '0', 20, getLongClozeSelectionGuardMin],
  [frontTitle, keys.longClozeFrontGuardFrontMax, '800', 500, getLongClozeFrontGuardThreshold]
] as const)('keeps the saved value and draft after %s fails, then retries', async (title, key, value, previous, read) => {
  mountSettings();
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  changeSetting(title, value);
  expect(screen.getByRole('alert')).toHaveTextContent('Changes could not be saved');
  expect(read()).toBe(previous);
  expect(window.localStorage.getItem(key)).toBeNull();
  expect(screen.getByRole(title === modeTitle ? 'combobox' : 'spinbutton')).toHaveValue(title === modeTitle ? value : Number(value));
  save.mockRestore();
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry' })); });
  expect(window.localStorage.getItem(key)).toBe(value);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each([[selectionTitle, '-1'], [selectionTitle, '501'], [frontTitle, '49'], [frontTitle, '10001'], [frontTitle, '']])(
  'rejects invalid %s input %s without saving', (title, value) => {
    mountSettings(); changeSetting(title!, value!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getLongClozeSelectionGuardMin()).toBe(20); expect(getLongClozeFrontGuardThreshold()).toBe(500);
  });

it('cancels a changed draft without writing, including blur', () => {
  mountSettings();
  const input = openSetting(frontTitle);
  fireEvent.change(input, { target: { value: '900' } }); fireEvent.blur(input);
  expect(getLongClozeFrontGuardThreshold()).toBe(500);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(openSetting(frontTitle)).toHaveValue(500);
});

it('reports an unreadable preference without replacing it, then retries loading', () => {
  const original = Storage.prototype.getItem;
  const load = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
    if (key === keys.longClozeFrontGuardMode) throw new Error('blocked');
    return original.call(this, key);
  });
  mountSettings();
  expect(screen.getByRole('alert')).toHaveTextContent('Cloze guard settings could not be loaded');
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  load.mockRestore(); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(openSetting(frontTitle)).toHaveValue(500);
});

it.each([
  [selectionTitle, '0', getLongClozeSelectionGuardMin], [selectionTitle, '500', getLongClozeSelectionGuardMin],
  [frontTitle, '50', getLongClozeFrontGuardThreshold], [frontTitle, '10000', getLongClozeFrontGuardThreshold]
] as const)('saves the desktop %s boundary %s', (title, value, read) => {
  mountSettings(); changeSetting(title, value);
  expect(read()).toBe(Number(value));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each(['remind', 'off'])('uses the explicitly saved %s policy in the next creation', async mode => {
  const ui = mountSettings();
  changeSetting(selectionTitle, '0'); changeSetting(frontTitle, '600');
  changeSetting(modeTitle, 'convert'); changeSetting(modeTitle, mode);
  ui.unmount();
  const rows = await createFromToolbar(mode === 'remind' ? 'Cancel' : undefined);
  expect(rows.map(row => row.kind)).toEqual(mode === 'remind' ? [] : ['item']);
});
