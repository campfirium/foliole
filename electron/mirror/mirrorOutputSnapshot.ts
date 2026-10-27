import { readNodeAuthorText } from '../../lib/core/nodes/nodeAuthorFrontmatter.js';
import { readDatabaseChangeToken } from '../database/databaseChangeToken.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot, type WorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { collectArticleMirrorPlans, type ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { loadMirrorArticleRecords, type MirrorArticleRecord, resolveAbsoluteMirrorPath } from './mirrorOutputStorage.js';
import { collectProtectedMirrorPaths, mirrorPathKey } from './mirrorPathIdentity.js';
import { collectChangedMirrorOwners, collectChangedMirrorPaths } from './mirrorPathOwnership.js';

export function captureMirrorOutputSnapshot(includeBody = true, articleIds?: string[]) {
  const paths = loadLibraryPathSettingsSync();
  const scoped = includeBody && Boolean(articleIds?.length);
  let snapshot = loadWorkspaceSnapshot({ includeBody: includeBody && !scoped });
  const plans = snapshot ? collectArticleMirrorPlans(snapshot, paths.mirror) : [];
  const recordsByArticleId = loadMirrorArticleRecords();
  if (scoped && snapshot) {
    const selected = new Set(articleIds);
    const changedOwners = collectChangedMirrorOwners(plans, recordsByArticleId, selected);
    const selectedPlans = plans.filter((plan) => selected.has(plan.articleId) || changedOwners.has(plan.articleId));
    snapshot = loadMirrorPlanBodies(snapshot, selectedPlans);
  }
  return { paths, plans, recordsByArticleId, snapshot };
}

export function captureArticleMirrorSnapshot(articleId: string) {
  const captured = captureMirrorOutputSnapshot(false);
  const plan = captured.plans.find((candidate) => candidate.articleId === articleId);
  if (!plan || !captured.snapshot) return null;
  return { ...captured, plan, snapshot: loadMirrorPlanBodies(captured.snapshot, [plan]) };
}

function loadMirrorPlanBodies(snapshot: WorkspaceSnapshot, plans: ArticleMirrorPlan[]) {
  const nodesById = { ...snapshot.nodesById };
  const nodeIds = new Set(plans.flatMap((plan) => [plan.articleId, ...plan.derivedNodeIds, ...plan.manualTopicIds]));
  for (const nodeId of nodeIds) {
    const node = nodesById[nodeId];
    const document = loadWorkspaceNodeDocument(nodeId);
    if (!node || !document) throw new Error(`Mirror render node is missing: ${nodeId}`);
    nodesById[nodeId] = { ...node, content: document.content, authorText: readNodeAuthorText(document.content) };
  }
  return { ...snapshot, nodesById };
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
  let verified = {
    captured: { ...seed, recordsByArticleId: new Map(seed.recordsByArticleId) },
    token: readDatabaseChangeToken()
  };
  const expectedRecords = new Map(seed.recordsByArticleId);
  let changedOwnershipPaths = new Set<string>();
  const current = () => {
    const token = readDatabaseChangeToken();
    if (token !== verified.token || loadLibraryPathSettingsSync().mirror !== verified.captured.paths.mirror) {
      const captured = captureMirrorOutputSnapshot(false);
      changedOwnershipPaths = collectChangedMirrorPaths(expectedRecords, captured.recordsByArticleId);
      verified = { captured, token };
    }
    return verified.captured;
  };
  return {
    retirementProtectedPaths(articleId: string) {
      const captured = current();
      const plans = captured.plans.filter((plan) => plan.articleId !== articleId).map((plan) => plan.targetPath);
      const records = [...captured.recordsByArticleId.values()].filter((record) => record.articleId !== articleId)
        .map((record) => resolveAbsoluteMirrorPath(captured.paths.mirror, record.relativePath));
      return collectProtectedMirrorPaths([...plans, ...records]);
    },
    isArticleStillAbsent: (articleId: string) => !current().plans.some((plan) => plan.articleId === articleId),
    isPlanCurrent(articleId: string, revision: string) {
      const { plans, snapshot } = current();
      const plan = plans.find((candidate) => candidate.articleId === articleId);
      if (!plan || !snapshot) return false;
      const oldPath = expectedRecords.get(articleId)?.relativePath;
      if (changedOwnershipPaths.has(mirrorPathKey(plan.relativePath)) ||
        (oldPath && changedOwnershipPaths.has(mirrorPathKey(oldPath)))) return false;
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
    async ownWrite<T>(
      write: () => Promise<T> | T,
      updateRecords: (records: Map<string, MirrorArticleRecord>) => void
    ) {
      const before = readDatabaseChangeToken();
      const result = await write();
      if (before === verified.token) {
        updateRecords(expectedRecords);
        updateRecords(verified.captured.recordsByArticleId);
        verified = { ...verified, token: readDatabaseChangeToken() };
      }
      return result;
    }
  };
}

export type MirrorPlanCurrency = ReturnType<typeof createMirrorPlanCurrency>;
