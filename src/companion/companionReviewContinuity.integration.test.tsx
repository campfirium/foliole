// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ listeners: new Map<string, Set<(state: { isActive: boolean }) => void>>() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({})
}));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: async (name: string, listener: (state: { isActive: boolean }) => void) => {
    const listeners = lifecycle.listeners.get(name) ?? new Set();
    listeners.add(listener);
    lifecycle.listeners.set(name, listeners);
    return { remove: async () => { listeners.delete(listener); } };
  }
} }));

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createFakeCapacitorConnection } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions, saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { selectCanonicalReviewQueueSource } from '../shared/workspaceCanonicalSelectors';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';

import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';
import { useCompanionWorkspaceLoaders } from './useCompanionWorkspaceLoaders';

let root = '';
let database: Database.Database | null = null;
const initialTime = '2026-05-01T00:00:00.000Z';

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
    booted_at: initialTime, database_path: null, database_ready: false,
    host_name: 'Review continuity fixture', runtime_kind: 'android-capacitor'
  }, manager);
}

async function seed(id: string, kind: 'item' | 'topic') {
  const node: WorkspaceNodeSnapshot = {
    id, kind, content: `Body ${id}`, reveal: kind === 'item' ? `Answer ${id}` : null,
    title: id, parentNodeId: null, createdAt: initialTime, updatedAt: initialTime,
    hideTitleHeading: false, isTitleManual: true, anchorLink: null, reading: null, review: null
  };
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion(node, 'fixture')]);
  if (kind === 'item') await saveCompanionSyncNodeReviewRecord({ nodeId: id, review: {
    difficulty: 4.2, due: initialTime, elapsedDays: 2, lapses: 0, lastReviewAt: initialTime,
    reps: 3, scheduledDays: 2, stability: 2.1, state: 2
  } });
}

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-review-continuity-'));
  await openLibrary();
  await seed('one', 'item');
  await seed('two', 'item');
  await seed('reading', 'topic');
});

afterEach(async () => {
  cleanup();
  await runCompanionSyncWriterTask(async () => undefined);
  await closeIosCompanionDatabase();
  if (database?.open) database.close();
  lifecycle.listeners.clear();
  rmSync(root, { recursive: true, force: true });
});

function renderSurface(initial: NativeCompanionWorkspaceSyncState, onlyReview: boolean) {
  return renderHook(({ only }) => {
    const [state, setState] = useState(initial);
    const [, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
    const [error, setError] = useState<string | null>(null);
    const actions = createWorkspaceSnapshotActions({ state, setState, setError,
      setStatus: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {} });
    const loaders = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle, setError });
    const surface = useCompanionArticleSurface({
      ...createWorkspaceSync(state.workspace_snapshot), ...actions, ...loaders, state
    }, createFloatingBar(), undefined, { isOnlyReviewOpen: only });
    return { ...surface, state, error, refresh: actions.refreshFromDevice };
  }, { initialProps: { only: onlyReview } });
}

async function expectCurrentBody(ui: ReturnType<typeof renderSurface>) {
  await waitFor(() => expect(ui.result.current.effectiveReviewSession.currentCard).not.toBeNull());
  const id = ui.result.current.effectiveReviewSession.currentCard?.nodeId;
  expect(id).toBeTruthy();
  await waitFor(() => expect(ui.result.current.readableArticle?.nodeId).toBe(id));
  expect(ui.result.current.effectiveReviewSession.currentCard?.content).toBe(`Body ${id}`);
  expect(ui.result.current.error).toBeNull();
  return id!;
}

async function foreground() {
  await act(async () => {
    for (const listener of lifecycle.listeners.get('appStateChange') ?? []) listener({ isActive: false });
    for (const listener of lifecycle.listeners.get('appStateChange') ?? []) listener({ isActive: true });
    for (const listener of lifecycle.listeners.get('resume') ?? []) listener({ isActive: true });
  });
}

it.each([false, true])('keeps the current card and body through fast navigation and foreground (only=%s)', async (only) => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), only);
  const id = await expectCurrentBody(ui);
  const queue = ui.result.current.effectiveReviewSession.queueNodeIds;
  act(() => ui.result.current.handleRevealAnswer());
  act(() => ui.result.current.handleTabAction('recent'));
  ui.rerender({ only: false });
  act(() => ui.result.current.handleTabAction('review'));
  ui.rerender({ only });
  expect(await expectCurrentBody(ui)).toBe(id);
  act(() => ui.result.current.handleRevealAnswer());
  await foreground();
  expect(await expectCurrentBody(ui)).toBe(id);
  expect(ui.result.current.isAnswerRevealed).toBe(true);
  expect(ui.result.current.effectiveReviewSession.queueNodeIds).toEqual(queue);
  if (only) expect(queue).not.toContain('reading');
  // Flow uses the desktop task queue; reading extensions are selected by its transitions.
  expect(database!.prepare('SELECT * FROM review_log').all()).toHaveLength(0);
});

it.each([false, true])('rebuilds the same eligible queue from durable state after database reopen (only=%s)', async (only) => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), only);
  await expectCurrentBody(ui);
  const queue = ui.result.current.effectiveReviewSession.queueNodeIds;
  act(() => ui.result.current.handleRevealAnswer());
  ui.unmount();
  await runCompanionSyncWriterTask(async () => undefined);
  await closeIosCompanionDatabase();
  await openLibrary();
  const state = await loadCompanionWorkspaceSyncState();
  const reopened = renderSurface(state, only);
  await expectCurrentBody(reopened);
  expect(reopened.result.current.effectiveReviewSession.queueNodeIds).toEqual(queue);
  expect(reopened.result.current.isAnswerRevealed).toBe(false);
  const plan = buildReviewQueuePlan({ ...selectCanonicalReviewQueueSource(state.workspace_snapshot!), now: new Date().toISOString() });
  if (only) expect(reopened.result.current.onlyReviewSession.queueNodeIds).toEqual(plan.queueNodeIds.filter((id) => id !== 'reading'));
});

it.each([false, true])('reconciles a deleted current card on foreground and clears its answer (only=%s)', async (only) => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), only);
  const id = await expectCurrentBody(ui);
  act(() => ui.result.current.handleRevealAnswer());
  const node = (await loadCompanionWorkspaceNode(id))!;
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion({
    ...node, deletedAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:00:00.000Z'
  }, 'fixture')]);
  await foreground();
  await waitFor(() => expect(ui.result.current.effectiveReviewSession.queueNodeIds).not.toContain(id));
  expect(await expectCurrentBody(ui)).not.toBe(id);
  expect(ui.result.current.isAnswerRevealed).toBe(false);
});

it('skips a remotely handled card before grading and reaches an empty Only Review session', async () => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), true);
  await expectCurrentBody(ui);
  act(() => ui.result.current.handleRevealAnswer());
  for (const nodeId of ['one', 'two']) {
    const review = ui.result.current.state.workspace_snapshot!.nodesById[nodeId]!.review!;
    await saveCompanionSyncNodeReviewRecord({ nodeId, review: { ...review, due: '2099-01-01T00:00:00.000Z',
      lastReviewAt: '2026-10-03T00:00:00.000Z', reps: review.reps + 1 } });
  }
  expect(database!.prepare('SELECT node_id, due FROM node_review ORDER BY node_id').all()).toEqual([
    { node_id: 'one', due: '2099-01-01T00:00:00.000Z' }, { node_id: 'two', due: '2099-01-01T00:00:00.000Z' }
  ]);
  await foreground();
  expect(ui.result.current.onlyReviewSession.currentCard).not.toBeNull();
  await act(() => ui.result.current.handleGradeReview(3));
  await waitFor(() => expect(ui.result.current.onlyReviewSession.currentCard).toBeNull());
  expect(ui.result.current.readableArticle).toBeNull();
  expect(ui.result.current.isAnswerRevealed).toBe(false);
  expect(ui.result.current.reviewSession.queueNodeIds).toEqual([]);
  expect(database!.prepare('SELECT * FROM review_log').all()).toHaveLength(0);
});

it('keeps the current task and revealed answer when new content changes the candidate order', async () => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), true);
  const id = await expectCurrentBody(ui);
  act(() => ui.result.current.handleRevealAnswer());
  await seed('new-item', 'item');
  const node = (await loadCompanionWorkspaceNode(id))!;
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion({
    ...node, content: 'Updated body', updatedAt: '2026-10-03T01:00:00.000Z'
  }, 'fixture')]);
  await foreground();
  expect(ui.result.current.effectiveReviewSession.currentCard?.nodeId).toBe(id);
  expect(ui.result.current.isAnswerRevealed).toBe(true);
  await waitFor(() => expect(ui.result.current.readableArticle?.content).toBe('Updated body'));
  await act(() => ui.result.current.handleGradeReview(3));
  expect(database!.prepare('SELECT node_id FROM review_log').all()).toEqual([{ node_id: id }]);
});

it('defers reading with Soon without writing a reading completion and restores a legal target on reopen', async () => {
  database!.exec("UPDATE node_review SET due = '2099-01-01T00:00:00.000Z'");
  await seed('reading-two', 'topic');
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), false);
  const id = await expectCurrentBody(ui);
  const before = database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all();
  await act(() => ui.result.current.handleSoonReviewTopic());
  expect(ui.result.current.effectiveReviewSession.currentCard?.nodeId).not.toBe(id);
  expect(database!.prepare('SELECT * FROM node_reading ORDER BY node_id').all()).toEqual(before);
  const resumeId = ui.result.current.effectiveReviewSession.currentCard?.nodeId;
  await waitFor(async () => {
    const { loadCompanionFlowResume } = await import('../shared/platform/companion/runtime/companionFlowResume');
    expect(await loadCompanionFlowResume(ui.result.current.state.workspace_snapshot!.libraryScope!, false)).toBe(resumeId);
  });
  ui.unmount();
  await closeIosCompanionDatabase();
  await openLibrary();
  const reopened = renderSurface(await loadCompanionWorkspaceSyncState(), false);
  expect(await expectCurrentBody(reopened)).toBe(resumeId);
});
