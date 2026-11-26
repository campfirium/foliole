import path from 'node:path';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import type { ArticleMirrorPlan } from './articleMirrorPlanning.js';
import type { MirrorArticleRecord } from './mirrorOutputStorage.js';
import { mirrorPathKey } from './mirrorPathIdentity.js';
import { collectChangedMirrorOwners } from './mirrorPathOwnership.js';
import { folderCouldClaimName } from './mirrorScopedDirectories.js';
import { planScopedMirrorArticles } from './mirrorScopedPlanning.js';
import {
  loadMirrorRecordsAtOrUnder,
  loadMirrorRecordsByArticleIds,
  loadMirrorRecordsInDirectory
} from './mirrorScopedRecords.js';

type MirrorNode = WorkspaceSnapshot['nodesById'][string];

const ROOT_RESERVED_NAMES = new Set(['inbox', 'trash']);

export interface ScopedMirrorCapture {
  plans: ArticleMirrorPlan[];
  recordsByArticleId: Map<string, MirrorArticleRecord>;
  snapshot: WorkspaceSnapshot;
}

function directoryOf(relativePath: string) {
  const directory = path.posix.dirname(relativePath);
  return directory === '.' ? '' : directory;
}

/** The directory an older mirror layout kept beside the file, which retirement removes with it. */
function legacyDirectoryOf(relativePath: string) {
  return path.posix.join(path.posix.dirname(relativePath), path.posix.basename(relativePath, '.md'));
}

function pathAndAncestorKeys(relativePath: string) {
  const keys = [mirrorPathKey(relativePath)];
  for (let directory = directoryOf(relativePath); directory; directory = directoryOf(directory)) {
    keys.push(mirrorPathKey(directory));
  }
  return keys;
}

/** Paths whose ownership decides what the full planner would write, keep, or remove for one selected article. */
function selectedPaths(plan: ArticleMirrorPlan, record: MirrorArticleRecord | undefined) {
  const files = [plan.relativePath, ...record ? [record.relativePath] : []];
  return { files, legacy: files.map(legacyDirectoryOf) };
}

function loadScopedRecords(plans: ArticleMirrorPlan[], selected: string[]) {
  const records = new Map(loadMirrorRecordsByArticleIds(selected).map((record) => [record.articleId, record]));
  const selectedPlans = plans.filter((plan) => selected.includes(plan.articleId));
  for (const directory of new Set(selectedPlans.map((plan) => directoryOf(plan.relativePath)))) {
    for (const record of loadMirrorRecordsInDirectory(directory)) records.set(record.articleId, record);
  }
  const probes = selectedPlans.flatMap((plan) => {
    const { files, legacy } = selectedPaths(plan, records.get(plan.articleId));
    return [...files, ...legacy].map(mirrorPathKey);
  });
  const probed = loadMirrorRecordsAtOrUnder(probes);
  for (const record of probed) records.set(record.articleId, record);
  return { probed, records };
}

/**
 * Whether the selected article's write, rename, and retirement depend only on the loaded paths: it stays in its
 * directory, no other article claims its files, and nothing lives at or below its file or legacy directory paths.
 */
function isSelfContained(args: {
  folders: MirrorNode[];
  plan: ArticleMirrorPlan;
  plans: ArticleMirrorPlan[];
  probed: MirrorArticleRecord[];
  records: Map<string, MirrorArticleRecord>;
}) {
  const { plan } = args;
  const record = args.records.get(plan.articleId);
  if (record && directoryOf(record.relativePath) !== directoryOf(plan.relativePath)) return false;
  const { files, legacy } = selectedPaths(plan, record);
  const fileKeys = new Set(files.map(mirrorPathKey));
  if (args.plans.some((other) => other.articleId !== plan.articleId && fileKeys.has(mirrorPathKey(other.relativePath)))) return false;
  const probeKeys = new Set([...fileKeys, ...legacy.map(mirrorPathKey)]);
  const occupied = args.probed.some((other) => pathAndAncestorKeys(other.relativePath).some((key) => probeKeys.has(key)) &&
    (other.articleId !== plan.articleId || !fileKeys.has(mirrorPathKey(other.relativePath))));
  if (occupied) return false;
  const stems = legacy.map((directory) => mirrorPathKey(path.posix.basename(directory)));
  // At the root, a legacy directory could also be the Inbox or Trash directory that other articles fill.
  if (!directoryOf(plan.relativePath) && stems.some((stem) => ROOT_RESERVED_NAMES.has(stem))) return false;
  return !args.folders.some((folder) => stems.some((stem) => folderCouldClaimName(folder, stem)));
}

/**
 * Captures plans and records for an incremental update from the selected articles' directories only. Returns null
 * when the full planner could reach a different result, so the caller captures the whole library instead.
 */
export function captureScopedMirrorPlans(articleIds: string[], mirrorRoot: string): ScopedMirrorCapture | null {
  const selected = [...new Set(articleIds)];
  const planning = planScopedMirrorArticles(selected, mirrorRoot);
  if (!planning) return null;
  const { probed, records } = loadScopedRecords(planning.plans, selected);
  for (const plan of planning.plans) {
    if (!selected.includes(plan.articleId)) continue;
    const folders = planning.directoryFoldersByArticleId.get(plan.articleId) ?? [];
    if (!isSelfContained({ folders, plan, plans: planning.plans, probed, records })) return null;
  }
  if (collectChangedMirrorOwners(planning.plans, records, new Set(selected)).size > 0) return null;
  return { plans: planning.plans, recordsByArticleId: records, snapshot: planning.snapshot };
}
