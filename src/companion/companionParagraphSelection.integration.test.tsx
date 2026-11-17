// @vitest-environment jsdom
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from '../features/editor/adapters/CodeMirrorEditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { SelectionAnnotationToolbarLayer } from './CompanionReadableArticleSelectionToolbarLayer';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { createCompanionSelectionAnnotationHandler } from './companionSelectionAnnotationController';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const host = vi.hoisted(() => ({ platform: 'android', writeClipboardText: vi.fn() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => host.platform, isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});
vi.mock('../shared/platform/companion/runtime/textClipboard', () => ({ writeClipboardText: host.writeClipboardText }));

const paragraph = 'Repeat this phrase.\nFinish the paragraph.';
const prefix = 'Repeat this phrase.\n\n';
const suffix = '\n\nNext paragraph.';
const content = prefix + paragraph + suffix;
let directory: string;
let database: Database.Database | null;

async function openLibrary() {
  const path = join(directory, 'library.db');
  const existed = existsSync(path);
  const sqlite = new Database(path);
  database = sqlite;
  await initializeIosCompanionDatabase({
    booted_at: '2026-11-15T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Paragraph selection fixture', runtime_kind: 'android-capacitor'
  }, createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; }));
}

beforeEach(async () => {
  const artifacts = join(process.cwd(), '.tmp/artifacts');
  mkdirSync(artifacts, { recursive: true });
  directory = mkdtempSync(join(artifacts, 'paragraph-test-'));
  host.writeClipboardText.mockReset().mockResolvedValue(undefined);
  host.platform = 'android';
  await openLibrary();
  database!.prepare(`INSERT INTO nodes (id, title, kind, content, created_at, updated_at)
    VALUES ('source', 'Source', 'topic', ?, '2026-11-15', '2026-11-15')`).run(content);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(directory, { recursive: true, force: true });
});

function Reader({ initial, immersive }: { initial: Awaited<ReturnType<typeof loadCompanionWorkspaceSyncState>>; immersive?: boolean }) {
  const [state, setState] = useState(initial);
  const toolbar = useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: 'source', snapshot: state.workspace_snapshot
  });
  const actions = createWorkspaceSnapshotActions({
    state, setState, setError: () => {}, setStatus: () => {},
    setSyncConflictCount: () => {}, setSyncProgress: () => {}
  });
  const save = createCompanionSelectionAnnotationHandler({
    ...actions, state, bootstrapState: { device_id: 'test-device' }
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  if (immersive) return <MouseGestureSettingsProvider><CompanionDraftProvider>
    <ImmersiveReadableArticle onExit={() => {}} onCreateSelectionAnnotation={save} snapshot={state.workspace_snapshot}
      readableArticle={{ content, hideTitleHeading: false, nodeId: 'source', persistedNodeViewState: null,
        pdfAttachmentId: null, textAnchorDecorations: [], title: 'Source' }} />
  </CompanionDraftProvider></MouseGestureSettingsProvider>;
  return <MouseGestureSettingsProvider>
    <CompanionArticleDocument content={content} nodeId="source" onEditorReady={toolbar.handleEditorReady} />
    <SelectionAnnotationToolbarLayer editor={toolbar.editorRef.current} parentNodeId="source" snapshot={state.workspace_snapshot}
      onCreateSelectionAnnotation={save} onClose={toolbar.clearSelectionAndCloseToolbar}
      onSelectParagraph={toolbar.selectReadingParagraph} getExpandedParagraphText={toolbar.getExpandedParagraphText}
      resolveSelectionPayload={toolbar.resolveSelectionPayload} state={toolbar.selectionToolbar} />
  </MouseGestureSettingsProvider>;
}

async function expandParagraph() {
  const { container } = renderWithLocalization(<Reader initial={await loadCompanionWorkspaceSyncState()} />);
  const lines = Array.from(container.querySelectorAll('.cm-line'));
  const selected = lines.filter(line => line.textContent === 'Repeat this phrase.')[1]!.firstChild!;
  const native = window.getSelection()!;
  const original = native.getRangeAt.bind(native);
  vi.spyOn(native, 'getRangeAt').mockImplementation(index => Object.assign(original(index), {
    getBoundingClientRect: () => new DOMRect(20, 100, 100, 20)
  }));
  native.setBaseAndExtent(selected, 11, selected, 7);
  fireEvent.pointerUp(selected.parentElement!);
  fireEvent.click(await screen.findByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Select paragraph' }));
  expect(native.anchorNode?.textContent).toBe('Repeat this phrase.');
  expect(native.anchorNode?.parentElement?.closest('.cm-line')).toBe(selected.parentElement);
  expect(native.anchorOffset).toBe(0);
  expect(native.focusNode?.textContent).toBe('Finish the paragraph.');
  expect(native.focusOffset).toBe('Finish the paragraph.'.length);
  expect(screen.getByRole('toolbar')).toBeVisible();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
}

it.each(['android', 'ios'])('copies the full second paragraph on %s', async platform => {
  host.platform = platform;
  await expandParagraph();
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));
  await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  expect(host.writeClipboardText).toHaveBeenCalledExactlyOnceWith(paragraph);
  expect(database!.prepare("SELECT id FROM nodes WHERE parent_id = 'source'").all()).toEqual([]);
});

it.each(['android', 'ios'].flatMap(platform => [
  { platform, action: 'Highlight', saved: paragraph, reveal: null },
  { platform, action: 'Add Comment', saved: paragraph + '\n※ Reader comment', reveal: null },
  { platform, action: 'Cloze', saved: prefix + '[...]' + suffix, reveal: paragraph }
]))('persists the paragraph after $action on $platform', async ({ platform, action, saved, reveal }) => {
  host.platform = platform;
  await expandParagraph();
  fireEvent.click(screen.getByRole('button', { name: action }));
  if (action === 'Add Comment') {
    window.getSelection()!.removeAllRanges();
    fireEvent.change(screen.getByRole('textbox', { name: '' }), { target: { value: 'Reader comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  }
  await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  const row = database!.prepare("SELECT id FROM nodes WHERE parent_id = 'source'").get() as { id: string };
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(await loadCompanionWorkspaceNode(row.id)).toMatchObject({
    content: saved, reveal,
    anchorLink: { locator: { from: prefix.length, to: prefix.length + paragraph.length, originalText: paragraph } }
  });
  expect(await loadCompanionWorkspaceNode('source')).toMatchObject({ content });
});


function touchPointer(target: Element | Document, type: string, x: number, y = 120) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, pointerType: { value: 'touch' }, isPrimary: { value: true }
  });
  fireEvent(target, event);
}

it.each(['long press cancellation', 'native release'])('hands off Android selection on %s and saves after scrolling', async (handoff) => {
  vi.spyOn(CodeMirrorEditorAdapter.prototype, 'getPositionClientRect')
    .mockImplementation(position => new DOMRect(20 + position * 3, 100, 3, 20));
  const { container } = renderWithLocalization(<Reader immersive initial={await loadCompanionWorkspaceSyncState()} />);
  const surface = container.querySelector<HTMLElement>('[data-companion-reading-surface]')!;
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 300));
  vi.spyOn(CodeMirrorEditorAdapter.prototype, 'getDocumentPositionAtClientPoint').mockImplementation(x =>
    Math.min(prefix.length + paragraph.length, x + surface.scrollTop));
  const selected = [...container.querySelectorAll('.cm-line')].filter(line => line.textContent === 'Repeat this phrase.')[1]!;
  const native = window.getSelection()!;
  const getRange = native.getRangeAt.bind(native);
  vi.spyOn(native, 'getRangeAt').mockImplementation(index => Object.assign(getRange(index), {
    getBoundingClientRect: () => new DOMRect(20, 100, 100, 20)
  }));
  const word = selected.firstChild!;
  const release = () => fireEvent(document, new Event('foliole-android-reading-touch-release'));
  fireEvent.touchStart(selected, { touches: [{ clientX: 50, clientY: 100 }] });
  native.setBaseAndExtent(word, 0, word, 6);
  const beforeRelease = handoff === 'long press cancellation';
  if (beforeRelease) fireEvent.contextMenu(selected);
  fireEvent.touchCancel(selected, { touches: [] });
  expect(native.toString()).toBe(beforeRelease ? '' : 'Repeat');
  expect(Boolean(screen.queryByRole('button', { name: 'Adjust anchor end' }))).toBe(beforeRelease);

  release();
  expect(native.toString()).toBe('');
  expect(container.querySelector('.cm-md-reading-selection')?.textContent).toBe('Repeat');
  const end = prefix.length + 18;
  touchPointer(screen.getByRole('button', { name: 'Adjust anchor end' }), 'pointerdown', end);
  touchPointer(document, 'pointermove', end);
  touchPointer(document, 'pointerup', end);
  release();
  expect(container.querySelector('.cm-md-reading-selection')?.textContent).toBe('Repeat this phrase');

  // jsdom cannot pan; deliver the browser's canceled pointer and resulting scroll.
  touchPointer(selected, 'pointerdown', 200, 200);
  touchPointer(selected, 'pointermove', 200, 160);
  touchPointer(selected, 'pointercancel', 200, 150);
  surface.scrollTop = 30;
  fireEvent.scroll(surface);
  fireEvent.touchEnd(selected, { touches: [] });
  release();
  expect(container.querySelector('.cm-md-reading-selection')?.textContent).toBe('Repeat this phrase');

  touchPointer(screen.getByRole('button', { name: 'Adjust anchor end' }), 'pointerdown', end);
  touchPointer(document, 'pointermove', end, 290);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 90)); });
  expect(surface.scrollTop).toBeGreaterThan(0);
  touchPointer(document, 'pointerup', end, 290);
  release();
  expect(native.toString()).toBe('');
  expect(screen.getByRole('button', { name: 'Highlight' })).toBeVisible();

  expect(database!.prepare("SELECT id FROM nodes WHERE parent_id = 'source'").all()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
  await waitFor(() => expect(database!.prepare("SELECT id FROM nodes WHERE parent_id = 'source'").get()).toBeDefined());
  const row = database!.prepare("SELECT id FROM nodes WHERE parent_id = 'source'").get() as { id: string };
  await closeIosCompanionDatabase();
  await openLibrary();
  expect(await loadCompanionWorkspaceNode(row.id)).toMatchObject({
    content: paragraph,
    anchorLink: { locator: { from: prefix.length, to: prefix.length + paragraph.length, originalText: paragraph } }
  });
  expect(await loadCompanionWorkspaceNode('source')).toMatchObject({ content });
});
