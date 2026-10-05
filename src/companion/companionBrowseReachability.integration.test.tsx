// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { resolveCompanionRecentArticles } from '../shared/platform/companionBrowseLists';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDirectoryContent } from './CompanionDirectoryContent';
import { CompanionListViewportProvider } from './CompanionListViewport';
import { RecentArticleList } from './CompanionRecentArticleList';

let root = '';
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
let database: Database.Database | null = null;

async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  const sqlite = new Database(file);
  database = sqlite;
  const connection = { ...createFakeCapacitorConnection(sqlite), getUrl: async () => ({ url: file }) };
  const manager = {
    closeConnection: async () => { sqlite.close(); database = null; },
    createConnection: async () => connection,
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: existed }),
    retrieveConnection: async () => connection
  } as unknown as IosCompanionDatabaseManager;
  await initializeIosCompanionDatabase({
    booted_at: '2026-10-03T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Android mutation fixture', runtime_kind: 'android-capacitor'
  }, manager);
}


async function seedLibrary() {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-browse-reachability-'));
  await openLibrary();
  const insert = database!.prepare(`INSERT INTO nodes
    (id, parent_id, title, kind, content, is_title_manual, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, '2026-10-03', '2026-10-03')`);
  database!.transaction(() => {
    insert.run('folder', null, 'Folder', 'folder', '');
    insert.run('other', null, 'Other', 'folder', '');
    insert.run('special-virtual-root', null, 'Virtual', 'folder', '');
    insert.run('manual', 'special-virtual-root', 'Manual', 'folder', '');
    const ids = Array.from({ length: 180 }, (_, index) =>
      `topic-${String(index).padStart(3, '0')}`);
    for (const id of ids) insert.run(id, 'folder', id, 'topic', `Body for ${id}`);
    database!.prepare('UPDATE nodes SET virtual_filter = ?, manual_child_order = ? WHERE id = ?')
      .run(JSON.stringify(createManualVirtualNodeFilter()), JSON.stringify(ids), 'manual');
  })();
}

async function disposeLibrary() {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  rmSync(root, { recursive: true, force: true });
}

// jsdom has no layout; use deterministic row geometry while retaining the real virtualizer.
function installListLayout() {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value(this: HTMLElement, options: ScrollToOptions | number) {
    if (typeof options === 'number') return;
    this.scrollTop = options.top ?? this.scrollTop;
    this.dispatchEvent(new Event('scroll'));
  } });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-index') ? 124 : 300;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(30000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.virtualList ? -(this.closest('[data-testid="scroll"]')?.scrollTop ?? 0) : 0;
    return { top, bottom: top + 300, height: 300, width: 400, x: 0, y: top, left: 0, right: 400, toJSON() {} };
  });
}

type View = 'directory' | 'recent' | 'virtual';
function BrowseSurface({ snapshot }: { snapshot: WorkspaceSnapshot | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('directory');
  const [selected, setSelected] = useState<string | null>(null);
  return <>
    {(['directory', 'recent', 'virtual'] as const).map((name) =>
      <button key={name} onClick={() => { setSelected(null); setView(name); }}>Show {name}</button>)}
    <button onClick={() => setSelected(null)}>Return to list</button>
    <div ref={scrollRef} data-testid="scroll">
      <CompanionListViewportProvider scrollRef={scrollRef} sortIdentity="name:asc">
        {selected ? <output>Selected {selected}</output> : view === 'recent'
          ? <RecentArticleList currentArticleId={null} onSelectArticle={setSelected}
            recentArticles={resolveCompanionRecentArticles(snapshot, 'name', 'asc')} />
          : <CompanionDirectoryContent selection={view === 'directory'
            ? { kind: 'internal', nodeId: 'folder' } : { kind: 'virtual', nodeId: 'manual' }}
            onChangeSelection={() => {}} onExitArticle={() => {}} onSelectNode={setSelected}
            snapshot={snapshot} sortKey="name" sortDirection="asc" />}
      </CompanionListViewportProvider>
    </div>
  </>;
}

beforeEach(async () => { await seedLibrary(); installListLayout(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await disposeLibrary(); });
const readSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot;
const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 90)); });
const topicButton = (id: string) => screen.getByRole('button', { name: `Open topic ${id}` });

async function scrollToTopic(index: number) {
  await settle();
  const scroll = screen.getByTestId('scroll');
  fireEvent.touchStart(scroll);
  fireEvent.scroll(scroll, { target: { scrollTop: index * 124 + 7 } });
  await waitFor(() => expect(topicButton(`topic-${String(index).padStart(3, '0')}`)).toBeInTheDocument());
  return scroll;
}

it('keeps separate list positions when switching directory, recent and virtual views', async () => {
  renderWithLocalization(<BrowseSurface snapshot={await readSnapshot()} />);
  const scroll = await scrollToTopic(100);
  fireEvent.click(screen.getByRole('button', { name: 'Show recent' }));
  await scrollToTopic(40);
  fireEvent.click(screen.getByRole('button', { name: 'Show virtual' }));
  await scrollToTopic(70);
  for (const [view, index] of [['directory', 100], ['recent', 40], ['virtual', 70]] as const) {
    fireEvent.click(screen.getByRole('button', { name: `Show ${view}` }));
    await waitFor(() => expect(topicButton(`topic-${String(index).padStart(3, '0')}`)).toBeInTheDocument());
    expect(scroll.scrollTop).toBe(index * 124 + 7);
    fireEvent.click(topicButton(`topic-${String(index).padStart(3, '0')}`));
    expect(screen.getByText(`Selected topic-${String(index).padStart(3, '0')}`)).toBeInTheDocument();
    scroll.scrollTop = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Return to list' }));
    await waitFor(() => expect(scroll.scrollTop).toBe(index * 124 + 7));
    await settle();
  }
});

it.each(['directory', 'recent', 'virtual'] as const)(
  'refreshes changed results while away from %s and returns to a surviving neighbor', async (mode) => {
    const ui = renderWithLocalization(<BrowseSurface snapshot={await readSnapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: `Show ${mode}` }));
    const scroll = await scrollToTopic(100);
    fireEvent.click(topicButton('topic-100'));
    // Fixture mutations represent already committed incoming facts; no sync algorithm is replaced.
    database!.exec("UPDATE nodes SET deleted_at = '2026-10-03' WHERE id = 'topic-100'");
    database!.exec("UPDATE nodes SET title = 'Changed 101' WHERE id = 'topic-101'");
    database!.exec("UPDATE nodes SET parent_id = 'other' WHERE id = 'topic-102'");
    ui.rerender(<BrowseSurface snapshot={await readSnapshot()} />);
    scroll.scrollTop = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Return to list' }));
    await waitFor(() => expect(topicButton('Changed 101')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Open topic topic-100' })).toBeNull();
    fireEvent.click(topicButton('Changed 101'));
    expect(screen.getByText('Selected topic-101')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to list' }));
    await settle();
    // Changed identity stays reachable in all views; a moved object leaves only its old physical folder.
    fireEvent.touchStart(scroll);
    fireEvent.scroll(scroll, { target: { scrollTop: 101 * 124 + 7 } });
    await settle();
    if (mode === 'directory') expect(screen.queryByRole('button', { name: 'Open topic topic-102' })).toBeNull();
    else {
      fireEvent.click(topicButton('topic-102'));
      expect(screen.getByText('Selected topic-102')).toBeInTheDocument();
    }
  }
);

it.each(['directory', 'recent', 'virtual'] as const)(
  'keeps the same visible object when %s gains a result before it', async (mode) => {
    const ui = renderWithLocalization(<BrowseSurface snapshot={await readSnapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: `Show ${mode}` }));
    const scroll = await scrollToTopic(100);
    database!.exec(`INSERT INTO nodes
      (id, parent_id, title, kind, content, is_title_manual, created_at, updated_at)
      VALUES ('added', 'folder', 'topic-099-new', 'topic', 'New body', 1, '2026-10-03', '2026-10-03')`);
    const order = Array.from({ length: 180 }, (_, index) => `topic-${String(index).padStart(3, '0')}`);
    order.splice(100, 0, 'added');
    database!.prepare('UPDATE nodes SET manual_child_order = ? WHERE id = ?').run(JSON.stringify(order), 'manual');
    ui.rerender(<BrowseSurface snapshot={await readSnapshot()} />);
    await waitFor(() => expect(scroll.scrollTop).toBe(101 * 124 + 7));
    expect(topicButton('topic-100')).toBeInTheDocument();
    fireEvent.click(topicButton('topic-099-new'));
    expect(screen.getByText('Selected added')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to list' }));
    await waitFor(() => expect(scroll.scrollTop).toBe(101 * 124 + 7));
  }
);
