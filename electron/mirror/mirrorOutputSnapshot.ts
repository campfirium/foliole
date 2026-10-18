import { readNodeAuthorText } from '../../lib/core/nodes/nodeAuthorFrontmatter.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
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

export function isMirrorPlanCurrent(articleId: string, revision: string) {
  const current = captureMirrorOutputSnapshot(false);
  const plan = current.plans.find((candidate) => candidate.articleId === articleId);
  if (!plan || !current.snapshot) return false;
  for (const nodeId of [plan.articleId, ...plan.derivedNodeIds, ...plan.manualTopicIds]) {
    const node = current.snapshot.nodesById[nodeId];
    const document = loadWorkspaceNodeDocument(nodeId);
    if (!node || !document) return false;
    node.content = document.content;
    node.authorText = readNodeAuthorText(document.content);
  }
  return mirrorPlanRevision(current.snapshot, plan) === revision;
}

export function isMirrorArticleStillAbsent(articleId: string) {
  return !captureMirrorOutputSnapshot(false).plans.some((plan) => plan.articleId === articleId);
}
