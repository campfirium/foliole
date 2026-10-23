import { readNodeAuthorText } from '../../lib/core/nodes/nodeAuthorFrontmatter.js';
import { readDatabaseChangeToken } from '../database/databaseChangeToken.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot, type WorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { collectArticleMirrorPlans, type ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';

export function captureMirrorOutputSnapshot(includeBody = true) {
  const paths = loadLibraryPathSettingsSync();
  const snapshot = loadWorkspaceSnapshot({ includeBody });
  const plans = snapshot ? collectArticleMirrorPlans(snapshot, paths.mirror) : [];
  return { paths, plans, recordsByArticleId: loadMirrorArticleRecords(), snapshot };
}

export function mirrorPlanRevision(
  snapshot: NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>,
  plan: ArticleMirrorPlan
) {
  const nodeIds = [plan.articleId, ...plan.derivedNodeIds, ...plan.manualTopicIds];
  return JSON.stringify({
    plan,
    nodes: nodeIds.map((nodeId) => snapshot.nodesById[nodeId] ?? null)
  });
}

type CapturedMirrorOutput = ReturnType<typeof captureMirrorOutputSnapshot>;

/**
 * Checks rendered mirrors against the library for one sync pass. The workspace is reloaded only
 * when the database changed since it was last verified, not once per article.
 * Every method must run while the caller owns the database connection.
 */
export function createMirrorPlanCurrency(seed: CapturedMirrorOutput) {
  let verified = { captured: seed, token: readDatabaseChangeToken() };
  const current = () => {
    const token = readDatabaseChangeToken();
    if (token !== verified.token || loadLibraryPathSettingsSync().mirror !== verified.captured.paths.mirror) {
      verified = { captured: captureMirrorOutputSnapshot(false), token };
    }
    return verified.captured;
  };
  return {
    isArticleStillAbsent: (articleId: string) => !current().plans.some((plan) => plan.articleId === articleId),
    isPlanCurrent(articleId: string, revision: string) {
      const { plans, snapshot } = current();
      const plan = plans.find((candidate) => candidate.articleId === articleId);
      if (!plan || !snapshot) return false;
      const nodesById: WorkspaceSnapshot['nodesById'] = {};
      for (const nodeId of [plan.articleId, ...plan.derivedNodeIds, ...plan.manualTopicIds]) {
        const node = snapshot.nodesById[nodeId];
        const document = loadWorkspaceNodeDocument(nodeId);
        if (!node || !document) return false;
        nodesById[nodeId] = { ...node, content: document.content, authorText: readNodeAuthorText(document.content) };
      }
      return mirrorPlanRevision({ ...snapshot, nodesById }, plan) === revision;
    },
    /** Runs this pass's own write; it does not count as a library change unless another one preceded it. */
    async ownWrite<T>(write: () => Promise<T> | T) {
      const before = readDatabaseChangeToken();
      const result = await write();
      if (before === verified.token) verified = { ...verified, token: readDatabaseChangeToken() };
      return result;
    }
  };
}

export type MirrorPlanCurrency = ReturnType<typeof createMirrorPlanCurrency>;
