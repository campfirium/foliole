import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { WorkspaceListProjection } from '../../lib/core/database/workspaceListProjection';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { stagePendingNodeSync } from '../shared/platform/workspacePendingNodeSync';
import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeRepository';

import { markNodeContentEdited, resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import { requestWorkspaceStateRefresh, requestWorkspaceSyncRefresh } from './workspaceRefreshScheduler';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';
import { refreshWorkspaceSyncProjection } from './workspaceSyncProjectionRefresh';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

function node(id = 'topic', updatedAt = '2026-10-01T00:00:00Z') {
  return { id, parentNodeId: null, kind: 'topic' as const, title: 'Article', isTitleManual: true, hideTitleHeading: false,
    collections: [], hasContent: true, hasReveal: false, content: '', reveal: null, anchorLink: null,
    reading: null, review: null, createdAt: '2026-01-01T00:00:00Z', updatedAt };
}

function projection(updatedAt = '2026-10-02T00:00:00Z'): WorkspaceListProjection {
  return { nodesById: { topic: node('topic', updatedAt) }, directOpeningById: { topic: 'Updated opening' },
    requestedNodeIds: ['topic'], structure: null, nodeOpenStateById: {}, untitledSequenceByParent: {} };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  resetNodeContentVersionGuardForTests();
  useWorkspaceStore.setState({ ...createInitialWorkspaceState(), libraryScope: 'library', isHydrated: true,
    activeNodeId: 'topic', nodesById: { topic: { ...node(), content: 'Before' }, other: node('other') },
    nodeOrder: ['topic', 'other'] });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('keeps a queued full refresh when the first ambient node scope names the current library', async () => {
  const invoke = vi.fn().mockResolvedValue(projection('2026-10-01T00:00:00Z'));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const full = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue(undefined);
  requestWorkspaceStateRefresh('sync-applied');
  requestWorkspaceSyncRefresh({ kind: 'nodes', nodeIds: ['topic'] }, 'library', 'content-changed');
  await vi.advanceTimersByTimeAsync(1200);
  expect(full).toHaveBeenCalledOnce();
  expect(invoke.mock.calls.filter(([command]) => command === 'load_workspace_list_projection')).toHaveLength(0);
});

it('loads the affected active body without a list hydrate and keeps current navigation', async () => {
  const invoke = vi.fn().mockImplementation(async (command: string) => {
    if (command === 'load_workspace_list_projection') return projection();
    if (command === 'load_node_document') return { ...node(), content: 'After', hideTitleHeading: false };
    if (command === 'save_editor_operation_history') return null;
    throw new Error(`unexpected command:${command}`);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  await refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('After');
  expect(useWorkspaceStore.getState().activeNodeId).toBe('topic');
  expect(invoke.mock.calls.map(([command]) => command)).toEqual(['load_workspace_list_projection', 'load_node_document']);
});

it('publishes the accepted committed version even when its author clock is older', async () => {
  useWorkspaceStore.setState(state => ({ nodesById: { ...state.nodesById,
    topic: { ...node(), currentVersionId: 'old-version', content: 'Before' } } }));
  const incoming = projection('2026-09-01T00:00:00Z');
  incoming.nodesById.topic!.currentVersionId = 'accepted-version';
  const invoke = vi.fn().mockImplementation(async (command: string) => {
    if (command === 'load_workspace_list_projection') return incoming;
    if (command === 'load_node_document') return { ...node(), content: 'Accepted body', hideTitleHeading: false };
    return null;
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  await refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Accepted body');
  expect(useWorkspaceStore.getState().nodesById.topic?.currentVersionId).toBe('accepted-version');
});

it('keeps an already loaded body when only committed reading or review state changed', async () => {
  const incoming = projection('2026-10-01T00:00:00Z');
  const invoke = vi.fn().mockImplementation(async (command: string) => {
    if (command === 'load_workspace_list_projection') return incoming;
    throw new Error(`unexpected command:${command}`);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  await refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Before');
  expect(invoke.mock.calls.map(([command]) => command)).toEqual(['load_workspace_list_projection']);
});

it('keeps edits and navigation made while the scoped read was running', async () => {
  let resolve!: (value: WorkspaceListProjection) => void;
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(new Promise<WorkspaceListProjection>(done => { resolve = done; })));
  const running = refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  markNodeContentEdited('topic');
  stagePendingNodeSync(createWorkspaceRuntimeNodeSnapshot({ ...node(), content: 'Unsaved draft' }, 0), { optimistic: true });
  useWorkspaceStore.setState(state => ({ activeNodeId: 'other', nodesById: {
    ...state.nodesById, topic: { ...node(), content: 'Unsaved draft' }
  } }));
  resolve(projection());
  await running;
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Unsaved draft');
  expect(useWorkspaceStore.getState().activeNodeId).toBe('other');
});

it('does not publish an old library read into a replacement library', async () => {
  let resolve!: (value: WorkspaceListProjection) => void;
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(new Promise<WorkspaceListProjection>(done => { resolve = done; })));
  const running = refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  useWorkspaceStore.setState({ libraryScope: 'replacement', activeNodeId: null });
  const replacement = useWorkspaceStore.getState();
  resolve(projection());
  await running;
  expect(useWorkspaceStore.getState()).toBe(replacement);
});

it('keeps a local creation committed while an older structure snapshot was being read', async () => {
  useWorkspaceStore.setState({ activeNodeId: null });
  const baseline = useWorkspaceStore.getState();
  let resolve!: (value: WorkspaceListProjection) => void;
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockReturnValue(new Promise<WorkspaceListProjection>(done => { resolve = done; })));
  const running = refreshWorkspaceSyncProjection({ kind: 'nodes', nodeIds: [], structure: true }, 'library');
  useWorkspaceStore.setState(current => ({ nodesById: { ...current.nodesById, 'new-local': node('new-local') },
    nodeOrder: [...current.nodeOrder, 'new-local'] }));
  resolve({ ...projection(), nodesById: {}, requestedNodeIds: [], structure: {
    memberIds: Object.keys(baseline.nodesById), nodeOrder: baseline.nodeOrder
  } });
  await running;
  expect(useWorkspaceStore.getState().nodesById['new-local']).toBeDefined();
  expect(useWorkspaceStore.getState().nodeOrder).toContain('new-local');
});

it('drains another commit to the same node that arrives during a read', async () => {
  let release!: (value: WorkspaceListProjection) => void;
  const first = new Promise<WorkspaceListProjection>(resolve => { release = resolve; });
  let reads = 0;
  const invoke = vi.fn().mockImplementation(async (command: string) => {
    if (command === 'load_workspace_list_projection') return ++reads === 1 ? first : projection('2026-10-03T00:00:00Z');
    if (command === 'load_node_document') return { ...node(), content: `Body ${reads}`, hideTitleHeading: false };
    if (command === 'save_editor_operation_history') return null;
    throw new Error(`unexpected command:${command}`);
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  requestWorkspaceSyncRefresh({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  vi.advanceTimersByTime(1200);
  requestWorkspaceSyncRefresh({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  release(projection());
  await vi.advanceTimersByTimeAsync(1200);
  expect(reads).toBe(2);
  expect(useWorkspaceStore.getState().nodesById.topic?.content).toBe('Body 2');
});

it('performs one complete reread when a scoped read fails', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockRejectedValue(new Error('read failed')));
  const full = vi.spyOn(useWorkspaceStore.persist, 'rehydrate').mockResolvedValue(undefined);
  requestWorkspaceSyncRefresh({ kind: 'nodes', nodeIds: ['topic'] }, 'library');
  await vi.advanceTimersByTimeAsync(1200);
  expect(full).toHaveBeenCalledTimes(1);
});
