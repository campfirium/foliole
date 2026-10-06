import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { collectArticleMirrorPlans, type ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';

export function captureMirrorOutputSnapshot() {
  const paths = loadLibraryPathSettingsSync();
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
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
  const current = captureMirrorOutputSnapshot();
  const plan = current.plans.find((candidate) => candidate.articleId === articleId);
  return Boolean(plan && current.snapshot && mirrorPlanRevision(current.snapshot, plan) === revision);
}

export function isMirrorArticleStillAbsent(articleId: string) {
  return !captureMirrorOutputSnapshot().plans.some((plan) => plan.articleId === articleId);
}
