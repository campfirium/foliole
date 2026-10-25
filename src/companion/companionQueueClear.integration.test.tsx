// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: async () => {} }) } }));

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { loadCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { applyCompanionLocalNodeVersions, saveCompanionSyncNodeReviewRecord } from '../shared/platform/companionSyncObjects';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionOnlyReviewContent } from './CompanionOnlyReviewContent';
import { CompanionReviewFallback } from './CompanionReviewFallback';
import { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { createFloatingBar, createWorkspaceSync } from './useCompanionArticleSurfaceTestSupport';

let root = '';
let database: Database.Database;
const initialTime = '2026-05-01T00:00:00.000Z';

beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-queue-clear-'));
  await openLibrary();
});
async function openLibrary() {
  const file = path.join(root, 'companion.db');
  const existed = existsSync(file);
  database = new Database(file);
  await initializeIosCompanionDatabase({ booted_at: initialTime, database_path: null, database_ready: false,
    host_name: 'Queue clear fixture', runtime_kind: 'android-capacitor' },
  createFakeCapacitorDatabaseManager(database, existed, () => {}));
}
afterEach(async () => {
  cleanup();
  await runCompanionSyncWriterTask(async () => undefined);
  await closeIosCompanionDatabase();
  if (database.open) database.close();
  rmSync(root, { recursive: true, force: true });
});

async function seed(kind: 'topic' | 'item', future = false) {
  await applyCompanionLocalNodeVersions([await toWorkspaceNativeNodeVersion({
    id: kind, kind, content: `Body ${kind}`, reveal: kind === 'item' ? 'Answer' : null,
    title: kind, parentNodeId: null, createdAt: initialTime, updatedAt: initialTime,
    hideTitleHeading: false, isTitleManual: true, anchorLink: null, reading: null, review: null
  }, 'fixture')]);
  if (kind === 'item') await saveCompanionSyncNodeReviewRecord({ nodeId: kind, review: {
    difficulty: 4.2, due: future ? '2099-01-01T00:00:00.000Z' : initialTime,
    elapsedDays: 2, lapses: 0, lastReviewAt: initialTime, reps: 3, scheduledDays: 2, stability: 2.1, state: 2
  } });
}

function Flow({ initial, only = false }: { initial: NativeCompanionWorkspaceSyncState; only?: boolean }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const actions = createWorkspaceSnapshotActions({ state, setState, setError,
    setStatus: () => {}, setSyncConflictCount: () => {}, setSyncProgress: () => {} });
  const surface = useCompanionArticleSurface({ ...createWorkspaceSync(state.workspace_snapshot), ...actions, state },
    createFloatingBar(), undefined, { isOnlyReviewOpen: only });
  const card = surface.reviewSession.currentCard;
  if (!surface.flowReady) return <p>Loading</p>;
  if (card) return <>
    <p>{card.title}</p>
    <button onClick={surface.handleRevealAnswer}>Reveal</button>
    <button onClick={() => void surface.handleGradeReview(3)}>Grade</button>
    <button onClick={() => void surface.handleReadReviewTopic()}>Read</button>
  </>;
  if (only) return <CompanionOnlyReviewContent hasSnapshot isAnswerRevealed={false} reviewSession={surface.onlyReviewSession} />;
  return <CompanionReviewFallback hasSnapshot error={error ?? surface.flowError}
    {...{ hasTopics: surface.flowHasTopics, canContinueReading: surface.canContinueReading,
      onContinueReading: surface.handleContinueReading }} />;
}

it('shows Queue clear after grading and continues the remaining topic without changing its schedule', async () => {
  await seed('item');
  await seed('topic');
  const initial = await loadCompanionWorkspaceSyncState();
  const view = render(<Flow initial={initial} />);
  await screen.findByText('item');
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
  await screen.findByText('Queue clear');
  expect(screen.queryByText(/synced review state/i)).not.toBeInTheDocument();
  const before = database.prepare('SELECT * FROM node_reading').all();
  const reviewBefore = database.prepare('SELECT * FROM node_review').all();
  fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }));
  await screen.findByText('topic');
  expect(database.prepare('SELECT * FROM node_reading').all()).toEqual(before);
  expect(database.prepare('SELECT * FROM node_review').all()).toEqual(reviewBefore);
  expect(database.prepare('SELECT node_id FROM review_log').all()).toEqual([{ node_id: 'item' }]);
  await waitFor(async () => expect(await loadCompanionFlowResume(initial.workspace_snapshot!.libraryScope!, false)).toBe('topic'));
  view.unmount();
  await closeIosCompanionDatabase();
  await openLibrary();
  render(<Flow initial={await loadCompanionWorkspaceSyncState()} />);
  await screen.findByText('topic');
  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  await screen.findByText('Queue clear');
  await waitFor(() => expect(database.prepare('SELECT node_id, last_handled_at, repetition_count FROM node_reading').all())
    .toEqual([{ node_id: 'topic', last_handled_at: expect.any(String), repetition_count: 1 }]));
});

it('shows Queue clear for a library whose items are scheduled later without offering unavailable reading', async () => {
  await seed('item', true);
  render(<Flow initial={await loadCompanionWorkspaceSyncState()} />);
  await screen.findByText('Queue clear');
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
  expect(screen.queryByText(/sync|snapshot/i)).not.toBeInTheDocument();
});

it('keeps an empty library distinct from Queue clear', async () => {
  render(<Flow initial={await loadCompanionWorkspaceSyncState()} />);
  await screen.findByText('No topics synced yet');
  expect(screen.queryByText('Queue clear')).not.toBeInTheDocument();
});

it('keeps Only Review clear of reading topics after its last grade', async () => {
  await seed('item');
  await seed('topic');
  render(<Flow initial={await loadCompanionWorkspaceSyncState()} only />);
  await screen.findByText('item');
  fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
  await screen.findByText('Queue clear');
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
  expect(database.prepare('SELECT * FROM node_reading').all()).toEqual([]);
});

it('shows refresh failures separately from Queue clear', () => {
  render(<CompanionReviewFallback hasSnapshot hasTopics canContinueReading={false}
    onContinueReading={() => {}} error="Could not refresh the saved action." />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh the saved action.');
  expect(screen.queryByText('Queue clear')).not.toBeInTheDocument();
});
