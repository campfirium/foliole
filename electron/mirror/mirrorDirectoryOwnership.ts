import path from 'node:path';

import type { ArticleMirrorPlan } from './articleMirrorPlanning.js';
import type { MirrorArticleRecord } from './mirrorOutputStorage.js';
import { mirrorPathKey } from './mirrorPathIdentity.js';

function directoryKeys(relativePath: string) {
  const keys = new Set<string>();
  let directory = path.posix.dirname(relativePath);
  while (directory !== '.') {
    keys.add(mirrorPathKey(directory));
    const parent = path.posix.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return keys;
}

export function collectChangedDirectoryOwnerGroups(plans: ArticleMirrorPlan[], records: Map<string, MirrorArticleRecord>) {
  const branches = new Map<string, Set<string>>();
  const files = new Map<string, Set<string>>();
  const claimFile = (articleId: string, relativePath: string) => {
    const key = mirrorPathKey(relativePath);
    const owners = files.get(key) ?? new Set<string>();
    owners.add(articleId);
    files.set(key, owners);
  };
  for (const record of records.values()) claimFile(record.articleId, record.relativePath);
  for (const plan of plans) {
    claimFile(plan.articleId, plan.relativePath);
    const record = records.get(plan.articleId);
    if (!record || path.posix.dirname(record.relativePath) === path.posix.dirname(plan.relativePath)) continue;
    const before = directoryKeys(record.relativePath);
    const after = directoryKeys(plan.relativePath);
    for (const key of new Set([...before, ...after])) {
      if (before.has(key) && after.has(key)) continue;
      const owners = branches.get(key) ?? new Set<string>();
      owners.add(plan.articleId);
      branches.set(key, owners);
    }
  }
  return [...branches.entries()].map(([key, owners]) => new Set([...owners, ...(files.get(key) ?? [])]));
}

export function orderMirrorPlansForMigration(plans: ArticleMirrorPlan[], records: Map<string, MirrorArticleRecord>) {
  const byId = new Map(plans.map((plan) => [plan.articleId, plan]));
  const fileOwners = new Map<string, Set<string>>();
  const directoryOwners = new Map<string, Set<string>>();
  for (const record of records.values()) {
    for (const directory of directoryKeys(record.relativePath)) {
      const occupants = directoryOwners.get(directory) ?? new Set<string>();
      occupants.add(record.articleId);
      directoryOwners.set(directory, occupants);
    }
    const key = mirrorPathKey(record.relativePath);
    const owners = fileOwners.get(key) ?? new Set<string>();
    owners.add(record.articleId);
    fileOwners.set(key, owners);
  }
  const ordered: ArticleMirrorPlan[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (plan: ArticleMirrorPlan) => {
    if (visited.has(plan.articleId)) return;
    if (visiting.has(plan.articleId)) throw new Error('Mirror file and directory paths have a cyclic dependency.');
    visiting.add(plan.articleId);
    const blockers = new Set(directoryOwners.get(mirrorPathKey(plan.relativePath)) ?? []);
    for (const key of directoryKeys(plan.relativePath)) {
      for (const id of fileOwners.get(key) ?? []) blockers.add(id);
    }
    for (const id of blockers) {
      const owner = byId.get(id);
      if (owner) visit(owner);
    }
    visiting.delete(plan.articleId);
    visited.add(plan.articleId);
    ordered.push(plan);
  };
  for (const plan of plans) visit(plan);
  return ordered;
}
