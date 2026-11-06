import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { act, cleanup, renderHook } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { loadWorkspaceListProjection } from '../../lib/core/database/workspaceListProjection.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord, loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { saveDefaultLibraryHome } from '../ipc/libraryPathBootstrap.js';
import { handleEditorHoldCommand } from '../ipc/storageEditorHoldCommands.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';
import { loadWorkspaceNodeDocument } from './workspaceNodeDocument.js';

export const transport = { root: '', remoteGate: undefined as Promise<void> | undefined,
  receiptGate: undefined as Promise<void> | undefined, failRetain: false, failSave: false,
  submitted: [] as Array<{ baseVersionId: string; versionId: string }> };
export let receiptWaiting: (() => void) | undefined;
export function observeReceiptWaiting(callback: () => void) { receiptWaiting = callback; }

export async function invokeEditorHandoff(command: string, args: Record<string, unknown>) {
  if (command === 'retain_node_editor_base' || command === 'release_node_editor_base') {
    if (command === 'retain_node_editor_base' && args.versionId === 'remote') {
      await transport.remoteGate;
      if (transport.failRetain) throw new Error('retain_failed');
    }
    return runWithDatabaseConnectionOwner(() => handleEditorHoldCommand(command, args));
  }
  if (command === 'save_node_open_state') return null;
  if (command === 'load_workspace_list_projection') return runWithDatabaseConnectionOwner(() =>
    loadWorkspaceListProjection(openDatabaseConnection().driver, args as { nodeIds: string[]; structure: boolean }));
  if (command === 'load_node_document') return runWithDatabaseConnectionOwner(() => loadWorkspaceNodeDocument(String(args.nodeId)));
  if (command !== 'update_node_content_with_anchors') throw new Error(`Unexpected handoff command: ${command}`);
  if (transport.failSave) { transport.failSave = false; return null; }
  transport.submitted.push(args.edit as typeof transport.submitted[number]);
  const result = await runWithDatabaseConnectionOwner(() => handleNodeMutationCommand(command, args));
  receiptWaiting?.();
  await transport.receiptGate;
  return result;
}

const rendererModule = (modulePath: string) => import(modulePath);
const { useProtectedWorkspaceEditorDraft } = await rendererModule('../../src/app/components/useProtectedWorkspaceEditorDraft.ts');
const { createWorkspaceNodeActionsFixture } = await rendererModule('../../src/store/workspaceStoreNodeActions.test-support.ts');
const { createWorkspaceNodeActions } = await rendererModule('../../src/store/workspaceStoreNodeActions.ts');
const { createWorkspaceActiveNodeAction } = await rendererModule('../../src/store/workspaceStoreActiveNodeAction.ts');
const { mergeHydratedNode } = await rendererModule('../../src/store/workspaceHydrateObjectMerge.ts');
const { drainPendingNodeContentRuntimePersists, resetPendingNodeContentRuntimePersistsForTests } =
  await rendererModule('../../src/store/workspaceStoreContentRuntimePersist.ts');
const { resetNodeContentVersionGuardForTests } = await rendererModule('../../src/store/workspaceNodeContentVersionGuard.ts');
const { useWorkspaceStore } = await rendererModule('../../src/store/workspaceStore.ts');
const { refreshWorkspaceSyncProjection } = await rendererModule('../../src/store/workspaceSyncProjectionRefresh.ts');

const peers: ReturnType<typeof textDevice>[] = [];
export function setupEditorHandoffTests() {
  beforeEach(async () => {
    transport.root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-editor-handoff-'));
    saveDefaultLibraryHome();
    initializeDatabase();
    Object.assign(transport, { remoteGate: undefined, receiptGate: undefined, failRetain: false, failSave: false, submitted: [] });
    receiptWaiting = undefined;
    vi.useFakeTimers();
  });
  afterEach(async () => {
    await act(async () => { cleanup(); await drainPendingNodeContentRuntimePersists(); });
    resetPendingNodeContentRuntimePersistsForTests();
    resetNodeContentVersionGuardForTests();
    vi.clearAllTimers();
    vi.useRealTimers();
    peers.splice(0).forEach(peer => peer.sqlite.close());
    closeDatabaseConnection();
    await fs.rm(transport.root, { recursive: true, force: true });
  });
}

function node(record: NativeSyncNodeRecord) {
  return { id: record.object_id, kind: 'topic' as const, parentNodeId: null, content: record.body_text ?? '',
    title: record.snapshot.title, reveal: null, anchorLink: null, review: null,
    currentVersionId: record.version_id, createdAt: record.snapshot.created_at, updatedAt: record.updated_at };
}
async function initialEditorState(base: NativeSyncNodeRecord, port: ReturnType<typeof createBetterSqliteDbPort>) {
  const initial = createWorkspaceNodeActionsFixture();
  initial.nodesById.topic = node(base);
  initial.nodesById.other = { ...node(base), id: 'other', currentVersionId: null, content: 'Other' };
  initial.nodeOrder = [...initial.nodeOrder, 'topic', 'other'];
  initial.activeNodeId = 'topic';
  initial.libraryScope = 't727-handoff';
  initial.isHydrated = true;
  // The second topic is a real persisted document for the continuous selection handoff.
  handleNodeMutationCommand('create_topic', { nodeId: 'other', parentNodeId: null, kind: 'topic', title: 'Other',
    content: 'Other', isTitleManual: false, reveal: null, anchorLink: null, position: null,
    createdAt: base.updated_at, updatedAt: base.updated_at });
  initial.nodesById.other = node((await loadCurrentSyncNodeRecord(port, 'other'))!);
  return initial;
}

export async function createEditorHandoffFixture(sharedStore = false) {
  const peer = textDevice();
  peers.push(peer);
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const base = textBranch('base', 'Original');
  const hash = hashTextBody('Unique alternative');
  base.snapshot.text_alternatives = [{ id: 'unique', body_blob_hash: hash, source_host_name: 'peer',
    created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z' }];
  base.alternative_bodies = [{ hash, text: 'Unique alternative' }];
  await peer.receive([base]);
  await applyConvergentSyncNodesWithDbPort(port, [base]);
  const initial = await initialEditorState(base, port);
  const store = sharedStore ? useWorkspaceStore
    : createStore<ReturnType<typeof createWorkspaceNodeActionsFixture>>(() => initial);
  if (sharedStore) store.setState(initial);
  const actions = createWorkspaceNodeActions(store.setState, store.getState);
  const select = createWorkspaceActiveNodeAction(store.setState);
  const ready: boolean[] = [];
  const view = renderHook(() => {
    const state = useSyncExternalStore<ReturnType<typeof createWorkspaceNodeActionsFixture>>(store.subscribe, store.getState);
    const current = state.nodesById[state.activeNodeId!];
    const draft = useProtectedWorkspaceEditorDraft({ nodeId: current.id, committedContent: current.content,
      committedVersionId: current.currentVersionId,
      onCommit: (id: string, content: string, options: unknown) => actions.updateNodeContent(id, content, options) });
    ready.push(draft.holdReady);
    return draft;
  });
  await act(async () => undefined);
  ready.length = 0;
  const input = (content: string, deliver = true) => {
    const nodeId = store.getState().activeNodeId;
    view.result.current.handleEditorInput({ nodeId, contentLength: content.length });
    if (deliver) view.result.current.handleEditorChange(content);
  };
  const drain = async () => { vi.advanceTimersByTime(0); return drainPendingNodeContentRuntimePersists(); };
  const current = async () => (await loadCurrentSyncNodeRecord(port, 'topic'))!;
  const heldBases = () => openDatabaseConnection().sqlite.prepare(
    "SELECT version_id FROM node_version_local_holds WHERE object_id = 'topic' AND hold_id LIKE 'desktop:%'").pluck().all();
  const remote = async (parent = base) => {
    vi.setSystemTime(Date.parse(base.updated_at) + 1000);
    await peer.receive([parent]);
    const next = textBranch('remote', 'Remote', parent);
    next.snapshot.text_alternatives = [];
    next.alternative_bodies = [];
    await peer.receive([next]);
    await applyConvergentSyncNodesWithDbPort(port, [await peer.current()]);
    await collectNodeVersionPayloads(port, 'topic');
    if (sharedStore) {
      await refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: ['topic'] }, initial.libraryScope);
      return;
    }
    const incoming = node(await current());
    store.setState((state: ReturnType<typeof createWorkspaceNodeActionsFixture>) => ({
      nodesById: { ...state.nodesById, topic: mergeHydratedNode(state.nodesById.topic, incoming) } }));
  };
  return { peer, port, view, store, select, ready, input, drain, current, remote, heldBases,
    baseFact: () => loadRetainedSyncNodeVersionFact(port, 'base'),
    async converge() { await peer.receive([await current()]); return wholeBodies(await peer.current()); } };
}
