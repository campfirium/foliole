// @vitest-environment jsdom
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('../../../electron/ipc/paths', () => ({ resolveAppPaths: () => ({
  app_data_dir: sandbox.root, app_cache_dir: sandbox.root, app_config_dir: sandbox.root, app_log_dir: sandbox.root
}) }));
vi.mock('../../../electron/ipc/workspaceContentChangedEvents', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../../electron/mirror/mirrorSyncScheduler', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: Record<string, unknown>) => {
  if (command !== 'update_node_content_with_anchors') throw new Error(`Unexpected command ${command}`);
  return handleLocalContentEditCommand(args, null);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection';
import { initializeDatabase } from '../../../electron/database/migrate';
import { upsertVersionedNodeSnapshot } from '../../../electron/database/nodeVersionedMutations';
import { handleLocalContentEditCommand } from '../../../electron/ipc/storageLocalContentEditCommand';
import { CodeMirrorEditorAdapter } from '../../features/editor/adapters/CodeMirrorEditorAdapter';
import { resetNodeContentVersionGuardForTests } from '../../store/workspaceNodeContentVersionGuard';
import { resetPendingNodeContentRuntimePersistsForTests } from '../../store/workspaceStoreContentRuntimePersist';
import { createWorkspaceNodeActions } from '../../store/workspaceStoreNodeActions';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from '../../store/workspaceStoreNodeActions.test-support';

import { useEditorDraftSync } from './useEditorDraftSync';

let editor: CodeMirrorEditorAdapter | null = null;
afterEach(async () => {
  editor?.destroy(); editor = null;
  resetPendingNodeContentRuntimePersistsForTests();
  resetNodeContentVersionGuardForTests();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  closeDatabaseConnection();
  if (sandbox.root) await rm(sandbox.root, { recursive: true, force: true });
});

async function mountDesktopEditor(size: number) {
  await mkdir('.tmp/artifacts/desktop-editor-save', { recursive: true });
  sandbox.root = await mkdtemp(path.resolve('.tmp/artifacts/desktop-editor-save/run-'));
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', sandbox.root);
  initializeDatabase();
  const initial = createWorkspaceNodeActionsFixture();
  const node = { ...initial.nodesById['node-1']!, content: 'Original body\n' + 'x'.repeat(size) };
  const baseVersionId = upsertVersionedNodeSnapshot({ ...node, nodeId: node.id, position: 0, isTitleManual: node.isTitleManual ?? false, anchorLink: node.anchorLink ?? null, reveal: node.reveal ?? null });
  initial.nodesById[node.id] = { ...node, currentVersionId: baseVersionId };
  const harness = createWorkspaceNodeActionsSetStateHarness(initial);
  const actions = createWorkspaceNodeActions(harness.setState);
  const hook = renderHook((source: { content: string; versionId: string | null | undefined }) => useEditorDraftSync({ committedContent: source.content,
    committedVersionId: source.versionId, nodeId: node.id,
    onCommit: (id, content, options) => { if (id) void actions.updateNodeContent(id, content, options); }
  }), { initialProps: { content: node.content, versionId: baseVersionId } });
  const host = document.createElement('div');
  document.body.append(host);
  editor = new CodeMirrorEditorAdapter(host, { initialContent: node.content,
    onChange: (content, meta) => hook.result.current.handleEditorChange(content, meta),
    onDocumentInput: meta => hook.result.current.handleEditorInput(meta)
  });
  editor.setNodeId(node.id);
  const reader = new Database(openDatabaseConnection().sqlite.name, { readonly: true });
  return { baseVersionId, node, hook, host, reader };
}

it.each([0, 1024 * 1024 - 4096])('persists real desktop editor input with one idle wait and %i extra characters', async size => {
  const { baseVersionId, node, hook, host, reader } = await mountDesktopEditor(size);
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => editor!.replaceRange(0, 0, 'Automatic input '));
    await act(async () => { await vi.advanceTimersByTimeAsync(1199); });
    expect(reader.prepare('SELECT content FROM nodes WHERE id=?').get(node.id)).toEqual({ content: node.content });
    await act(async () => { await vi.advanceTimersByTimeAsync(3); });
    expect(reader.prepare('SELECT content FROM nodes WHERE id=?').get(node.id))
      .toEqual({ content: 'Automatic input ' + node.content });
    expect(reader.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
      .toEqual([{ parent_version_id: baseVersionId }]);
    const saved = () => {
      const row = reader.prepare<[], { content: string; current_version_id: string }>(
        "SELECT content, current_version_id FROM nodes WHERE id='node-1'").get();
      if (!row) throw new Error('Saved node missing');
      return row;
    };
    const first = saved();
    hook.rerender({ content: first.content, versionId: first.current_version_id });
    for (let index = 0; index < 10; index++) {
      act(() => editor!.replaceRange(0, 0, String(index)));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    }
    expect(saved()).toEqual(first);
    await act(async () => { await vi.advanceTimersByTimeAsync(703); });
    const second = saved();
    expect(second.content).toBe('9876543210' + first.content);
    expect(reader.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
      .toEqual(expect.arrayContaining([{ parent_version_id: baseVersionId }, { parent_version_id: first.current_version_id }]));
    for (const prefix of ['short pause A ', 'short pause B ']) {
      const previous = saved();
      hook.rerender({ content: previous.content, versionId: previous.current_version_id });
      act(() => editor!.replaceRange(0, 0, prefix));
      await act(async () => { await vi.advanceTimersByTimeAsync(1303); });
      expect(saved().content).toBe(prefix + previous.content);
      expect(reader.prepare('SELECT parent_version_id FROM node_sync_version_parents').all())
        .toContainEqual({ parent_version_id: previous.current_version_id });
    }
    expect(reader.prepare('SELECT COUNT(*) AS count FROM node_sync_version_parents').get()).toEqual({ count: 4 });
  } finally { reader.close(); hook.unmount(); host.remove(); }
}, 30_000);
