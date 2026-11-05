import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { getSelectionCommandPayloadForContentRanges } from '../shared/selectionCommandPayload';

import { createCompanionSelectionAnnotationHandler } from './companionSelectionAnnotationController';
import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const answer = 'This is a sufficiently long selected answer';
const content = `${answer} ${'Context for the same topic. '.repeat(25)}`;
const payload = getSelectionCommandPayloadForContentRanges('source', content, [{ from: 0, to: answer.length }])!;

beforeEach(async () => {
  window.localStorage.clear();
  library = await createSearchLibrary(0);
  library.database.prepare(`INSERT INTO nodes (id,title,content,created_at,updated_at)
    VALUES ('source','Source',?,'2026-11-05','2026-11-05')`).run(content);
});
afterEach(async () => { vi.restoreAllMocks(); await library.close(); });

function creations() {
  return library.database.prepare("SELECT id FROM nodes WHERE parent_id = 'source'").all() as Array<{ id: string }>;
}

async function mountToolbar(options: { resolve?: () => typeof payload | null; refresh?: () => Promise<void> } = {}) {
  const onClose = vi.fn();
  const workspace = { bootstrapState: { device_id: 'Search' },
    state: { workspace_snapshot: (await loadCompanionWorkspaceSyncState()).workspace_snapshot },
    refreshAfterMutation: options.refresh ?? vi.fn(async () => {}) };
  const handle = createCompanionSelectionAnnotationHandler(workspace as never);
  const onApply = vi.fn(async (...args: Parameters<typeof handle>) => { await handle(...args); });
  const ui = renderWithLocalization(<CompanionSelectionAnnotationToolbar onApply={onApply} onClose={onClose}
    onAddExistingHighlightNote={vi.fn()} onDeleteExistingHighlight={vi.fn()}
    {...(options.resolve ? { resolveSelectionPayload: options.resolve } : {})}
    state={{ left: 12, top: 12, noteLeft: 12, noteTop: 52, payload }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cloze', exact: true }));
  return { ...ui, onApply, onClose };
}

it('asks before any permanent write and cancel leaves the source and learning facts intact', async () => {
  const ui = await mountToolbar();
  expect(screen.getByRole('dialog')).toHaveTextContent('massive card');
  expect(creations()).toEqual([]);
  expect(ui.onApply).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(ui.onClose).toHaveBeenCalledTimes(1);
  expect(creations()).toEqual([]);
  expect(library.database.prepare('SELECT * FROM node_review').all()).toEqual([]);
  expect(library.database.prepare("SELECT content FROM nodes WHERE id='source'").get()).toEqual({ content });
});

it.each(['Cloze', 'Highlight'])('confirms %s using the captured selection after focus loses the native selection and survives reopening', async choice => {
  let current: typeof payload | null = payload;
  const ui = await mountToolbar({ resolve: () => current });
  current = null;
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: choice, exact: true }));
  await waitFor(() => expect(ui.onClose).toHaveBeenCalledTimes(1));
  expect(creations()).toHaveLength(1);
  const id = creations()[0]!.id;
  const node = await loadCompanionWorkspaceNode(id);
  expect(node).toMatchObject({ kind: choice === 'Cloze' ? 'item' : 'topic',
    content: choice === 'Cloze' ? payload.clozeContent.trim() : answer,
    reveal: choice === 'Cloze' ? answer : null,
    anchorLink: { id: payload.anchorId, kind: choice === 'Cloze' ? 'cloze' : 'highlight',
      locator: { from: 0, to: answer.length, originalText: answer } } });
  expect(library.database.prepare('SELECT * FROM node_review WHERE node_id=?').all(id)).toHaveLength(choice === 'Cloze' ? 1 : 0);
  ui.unmount();
  await reopenSearchLibrary(library.root, '2026-11-05T10:00:00Z');
  expect(await loadCompanionWorkspaceNode(id)).toEqual(node);
  expect((await loadCompanionWorkspaceNode('source'))?.content).toBe(content);
});

it.each([['convert', 'topic'], ['off', 'item']] as const)('applies the desktop %s strategy through real storage', async (mode, kind) => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.longClozeFrontGuardMode, mode);
  const ui = await mountToolbar();
  await waitFor(() => expect(ui.onClose).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(creations()).toHaveLength(1);
  expect((await loadCompanionWorkspaceNode(creations()[0]!.id))?.kind).toBe(kind);
});

it('keeps the original payload after a write failure and retries without a partial item', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let current: typeof payload | null = payload;
  const ui = await mountToolbar({ resolve: () => current });
  current = null;
  library.database.exec("CREATE TRIGGER reject_cloze BEFORE INSERT ON nodes BEGIN SELECT RAISE(ABORT,'full'); END");
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cloze', exact: true }));
  await screen.findAllByRole('alert');
  expect(ui.onClose).not.toHaveBeenCalled();
  expect(creations()).toEqual([]);
  expect(library.database.prepare('SELECT * FROM node_review').all()).toEqual([]);
  library.database.exec('DROP TRIGGER reject_cloze');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cloze', exact: true }));
  await waitFor(() => expect(ui.onClose).toHaveBeenCalledTimes(1));
  expect(creations()).toHaveLength(1);
  expect((await loadCompanionWorkspaceNode(creations()[0]!.id))?.reveal).toBe(answer);
});

it('retries only refresh after a confirmed creation was already committed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const refresh = vi.fn().mockRejectedValueOnce(new Error('refresh')).mockResolvedValue(undefined);
  const ui = await mountToolbar({ refresh });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cloze', exact: true }));
  await screen.findAllByRole('alert');
  expect(creations()).toHaveLength(1);
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cloze', exact: true })).toBeDisabled();
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refresh' })); });
  expect(ui.onClose).toHaveBeenCalledTimes(1);
  expect(creations()).toHaveLength(1);
  expect(ui.onApply).toHaveBeenCalledTimes(1);
});
