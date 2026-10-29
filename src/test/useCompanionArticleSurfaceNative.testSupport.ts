import path from 'node:path';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview';
import { useDailyFlowSurface } from '../companion/companionFlowDay.testSupport';
import { createCompanionArticleSnapshot } from '../companion/useCompanionArticleSurfaceTestSupport';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { registerCompanionSyncAppliedRefresh } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { getCompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncNodeVersions';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';


export const ARTICLE_NOW = '2026-04-25T09:00:00.000Z';
export type ArticleNode = WorkspaceSnapshot['nodesById'][string];

export function nativeArticleFixture() {
  let library: Awaited<ReturnType<typeof createSearchLibrary>>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ARTICLE_NOW));
    hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
    library = await createSearchLibrary(0);
  });
  afterEach(async () => {
    await act(async () => {
      cleanup();
      await (await getCompanionReadIntents()).drain();
      await runCompanionSyncWriterTask(async () => undefined);
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
    await library.close();
  });

  async function apply(nodes: ArticleNode[]) {
    const records = await Promise.all(nodes.map(async node => {
      const previous = await loadCompanionWorkspaceNode(node.id);
      return toWorkspaceNativeNodeVersion({ ...node, openingText: resolveNodeOpeningText(node.content, node.title),
        currentVersionId: previous?.currentVersionId ?? null }, 'remote');
    }));
    const ids = await applyCompanionSyncNodeVersions(records);
    expect(new Set(ids)).toEqual(new Set(nodes.map(node => node.id)));
    registerCompanionSyncAppliedRefresh({ kind: 'nodes', nodeIds: ids, structure: true });
  }

  async function open(snapshot = createCompanionArticleSnapshot(), prepare?: () => Promise<void>) {
    await apply(Object.values(snapshot.nodesById));
    await prepare?.();
    const initial = (await refreshCompanionWorkspaceAfterMutation())!;
    const ui = renderHook(() => useDailyFlowSurface(initial));
    await waitFor(() => expect(ui.result.current.surface.flowReady).toBe(true));
    await waitFor(() => expect(ui.result.current.surface.readableArticle?.content).toBeTruthy());
    await act(async () => { await ui.result.current.workspace.refreshAfterMutation(); });
    return ui;
  }

  async function settle() {
    await act(async () => { await (await getCompanionReadIntents()).drain(); });
  }

  async function rejectAdmission(action: 'read' | 'later' | 'dismiss' | 'grade') {
    if (action === 'read') {
      const engine = await getCompanionReadIntents();
      const journal = new Database(path.join(library.root, `foliole-read-intents-${engine.journal.libraryId}.db`));
      try {
        journal.exec("CREATE TRIGGER reject_admission BEFORE INSERT ON read_intents BEGIN SELECT RAISE(ABORT, 'admission unavailable'); END");
      } finally { journal.close(); }
    } else {
      library.database.exec(`CREATE TRIGGER reject_admission BEFORE INSERT ON companion_meta
        WHEN NEW.key LIKE 'flow_history:%' BEGIN SELECT RAISE(ABORT, 'admission unavailable'); END`);
    }
  }

  async function historyCount(key: string) {
    return (await loadCompanionFlowHistory(key)).undoStack.length;
  }

  return { get library() { return library; }, apply, open, settle, rejectAdmission, historyCount };
}
