// @vitest-environment jsdom
import { File } from 'node:buffer';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ listeners: new Map<string, Set<(state: { isActive: boolean }) => void>>() }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return {
    Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub
  };
});
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
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions, saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';
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
  const manager = createFakeCapacitorDatabaseManager(sqlite, existed, () => { database = null; });
  await initializeIosCompanionDatabase({
    booted_at: initialTime, database_path: null, database_ready: false,
    host_name: 'Flow round fixture', runtime_kind: 'android-capacitor'
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
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-flow-round-'));
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

function renderSurface(initial: NativeCompanionWorkspaceSyncState, reviewFirst: boolean) {
  return renderHook(({ only }) => {
    const [state, setState] = useState(initial);
    const [, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
    const [error, setError] = useState<string | null>(null);
    const actions = createWorkspaceSnapshotActions({ state, setState, setError,
      setStatus: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {} });
    const loaders = useCompanionWorkspaceLoaders({ state, setState, setReadableArticle, setError });
    const surface = useCompanionArticleSurface({
      ...createWorkspaceSync(state.workspace_snapshot), ...actions, ...loaders, state
    }, createFloatingBar(), undefined);
    useEffect(() => { surface.setFlowSessionMode(only ? 'review-first' : 'recommended'); }, [only]);
    return { ...surface, state, error, refresh: actions.refreshFromDevice };
  }, { initialProps: { only: reviewFirst } });
}

// Core experience guard (T868): every card Flow serves can be finished, and a finished queue hides its counter and plant.
it.each([false, true])('finishes every served card in one round and hides the queue progress at the end (only=%s)', async (only) => {
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), only);
  const served: string[] = [];
  for (let step = 0; step < 10; step += 1) {
    await waitFor(() => expect(ui.result.current.flowReady).toBe(true));
    const card = ui.result.current.effectiveReviewSession.currentCard;
    if (!card) break;
    await waitFor(() => expect(ui.result.current.readableArticle?.nodeId).toBe(card.nodeId));
    served.push(card.nodeId);
    if (card.itemKind === 'fsrs') {
      expect(ui.result.current.flowSummary.progressCounts).toBeDefined();
      act(() => ui.result.current.handleRevealAnswer());
      await act(() => ui.result.current.handleGradeReview(3));
    } else {
      await act(() => ui.result.current.handleReadReviewTopic());
    }
    expect(ui.result.current.error).toBeNull();
    await waitFor(() => expect(ui.result.current.effectiveReviewSession.currentCard?.nodeId).not.toBe(card.nodeId));
  }
  expect(ui.result.current.effectiveReviewSession.currentCard).toBeNull();
  expect(served).toEqual(expect.arrayContaining(only ? ['one', 'two'] : ['one', 'two', 'reading']));
  expect(new Set(served).size).toBe(served.length);
  const graded = database!.prepare('SELECT node_id FROM review_log ORDER BY node_id').all();
  expect(graded).toEqual([{ node_id: 'one' }, { node_id: 'two' }]);
  expect(ui.result.current.flowSummary.queueCleared).toBe(true);
  expect(ui.result.current.flowSummary.progressCounts).toBeUndefined();
});

it('serves a freshly imported file in Flow and completes its reading', async () => {
  database!.exec("UPDATE node_review SET due = '2099-01-01T00:00:00.000Z'");
  database!.exec("DELETE FROM nodes WHERE id = 'reading'");
  const imported = await createCompanionFileImportHandler({ refreshAfterMutation: async () => null })(
    new File(['# Imported title\n\nImported body'], 'imported.md') as unknown as Parameters<ReturnType<typeof createCompanionFileImportHandler>>[0]);
  expect(imported).toHaveProperty('nodeId');
  const id = (imported as { nodeId: string }).nodeId;
  const ui = renderSurface(await loadCompanionWorkspaceSyncState(), false);
  await waitFor(() => expect(ui.result.current.effectiveReviewSession.currentCard?.nodeId).toBe(id));
  await waitFor(() => expect(ui.result.current.readableArticle?.content).toContain('Imported body'));
  await act(() => ui.result.current.handleReadReviewTopic());
  expect(ui.result.current.error).toBeNull();
  expect(ui.result.current.readingError).toBeNull();
  await waitFor(() => expect(database!.prepare('SELECT repetition_count FROM node_reading WHERE node_id = ?').get(id))
    .toEqual({ repetition_count: 1 }));
});
