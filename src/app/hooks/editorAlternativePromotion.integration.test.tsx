// @vitest-environment jsdom
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('../../../electron/ipc/paths', () => ({ resolveAppPaths: () => ({
  app_data_dir: sandbox.root, app_cache_dir: sandbox.root, app_config_dir: sandbox.root, app_log_dir: sandbox.root
}) }));
vi.mock('../../../electron/ipc/workspaceContentChangedEvents', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../../../electron/mirror/mirrorSyncScheduler', () => ({ scheduleMirrorSync: vi.fn() }));

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort';
import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection';
import { initializeDatabase } from '../../../electron/database/migrate';
import { loadNodeTextAlternativePreview, promoteNodeTextAlternative } from '../../../electron/database/nodeTextAlternatives';
import { upsertVersionedNodeSnapshot } from '../../../electron/database/nodeVersionedMutations';
import { handleLocalContentEditCommand } from '../../../electron/ipc/storageLocalContentEditCommand';
import { upsertTextBodyBlob } from '../../../lib/core/database/contentBodyBlobs';
import { retainLocalEditBase } from '../../../lib/core/sync/nodeVersionLocalEditHold';
import { resetPendingNodeContentRuntimePersistsForTests } from '../../store/workspaceStoreContentRuntimePersist';

import { useEditorDraftSync } from './useEditorDraftSync';

const MAIN = '\ufeffOriginal\r\n原文 😀\0\r\n';
const ALTERNATIVE = '\ufeffSelected\r\n完整 😀\0\r\n';
const DRAFT = 'Unsaved input ' + MAIN;

afterEach(async () => {
  resetPendingNodeContentRuntimePersistsForTests();
  vi.useRealTimers();
  closeDatabaseConnection();
  if (sandbox.root) await rm(sandbox.root, { recursive: true, force: true });
});

async function seed() {
  await mkdir('.tmp/artifacts/T618', { recursive: true });
  sandbox.root = await mkdtemp(path.resolve('.tmp/artifacts/T618/draft-'));
  initializeDatabase();
  const now = new Date().toISOString();
  const base = upsertVersionedNodeSnapshot({ nodeId: 'topic', kind: 'topic', title: 'Article',
    content: MAIN, parentNodeId: null, position: 0, isTitleManual: true, hideTitleHeading: false,
    anchorLink: null, createdAt: now, updatedAt: now, reveal: null });
  if (!base) throw new Error('editor_base_missing');
  const { sqlite, driver } = openDatabaseConnection();
  const hash = upsertTextBodyBlob(driver, ALTERNATIVE, now);
  const row = sqlite.prepare<[string], { snapshot_json: string }>(
    'SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?').get(base)!;
  const snapshot = JSON.parse(row.snapshot_json);
  snapshot.text_alternative_bodies = [{ hash, text: ALTERNATIVE }];
  snapshot.text_alternatives = [{ id: 'alt', body_blob_hash: hash, source_host_name: 'Other device',
    created_at: now, expires_at: new Date(Date.now() + 86400000).toISOString() }];
  sqlite.prepare('UPDATE node_sync_versions SET snapshot_json = ? WHERE version_id = ?').run(JSON.stringify(snapshot), base);
  await retainLocalEditBase(createBetterSqliteDbPort(sqlite), { holdId: 'editor', nodeId: 'topic', versionId: base });
  return base;
}

it.each([false, true])('consumes a promoted body while protecting pending input: draft=%s', async hasDraft => {
  const base = await seed();
  const onCommit = vi.fn();
  const hook = renderHook(source => useEditorDraftSync({ committedContent: source.content,
    committedVersionId: source.version, nodeId: 'topic', onCommit
  }), { initialProps: { content: MAIN, version: base } });
  try {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    if (hasDraft) act(() => {
      hook.result.current.handleEditorInput({ nodeId: 'topic', contentLength: DRAFT.length });
      hook.result.current.handleEditorChange(DRAFT);
    });
    expect(await promoteNodeTextAlternative('topic', 'alt')).toMatchObject({ status: 'promoted' });
    const { sqlite } = openDatabaseConnection();
    const selected = sqlite.prepare<[], { content: string; current_version_id: string }>(
      "SELECT content, current_version_id FROM nodes WHERE id = 'topic'").get()!;
    expect(selected.content).toBe(ALTERNATIVE);
    hook.rerender({ content: selected.content, version: selected.current_version_id });
    expect(hook.result.current.editorContent).toBe(hasDraft ? DRAFT : ALTERNATIVE);
    if (!hasDraft) { expect(onCommit).not.toHaveBeenCalled(); return; }
    act(() => { hook.result.current.flushDraftSynchronously(); });
    expect(onCommit).toHaveBeenCalledWith('topic', DRAFT, {
      publishLocal: false, baseContent: MAIN, baseVersionId: base
    });
    const options = onCommit.mock.calls[0]![2];
    await handleLocalContentEditCommand({ parent: { nodeId: 'topic', content: DRAFT,
      kind: 'topic', title: 'Article', parentNodeId: null, position: 0, isTitleManual: true,
      anchorLink: null, reveal: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    affectedAnchors: [], edit: { baseVersionId: options.baseVersionId,
      baseContent: options.baseContent, versionId: 'ver_pending_draft' } }, null);
    const preview = await loadNodeTextAlternativePreview('topic');
    expect(new Set([preview?.current_content, preview?.updated_content])).toEqual(new Set([DRAFT, ALTERNATIVE]));
    const parent = sqlite.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = 'ver_pending_draft'").get();
    expect(parent).toEqual({ parent_version_id: base });
  } finally { hook.unmount(); }
});
