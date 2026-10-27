import type { ArticleMirrorPlan } from './articleMirrorPlanning.js';
import { collectChangedDirectoryOwnerGroups } from './mirrorDirectoryOwnership.js';
import type { MirrorArticleRecord } from './mirrorOutputStorage.js';
import { mirrorPathKey } from './mirrorPathIdentity.js';

// Both planned destinations and recorded paths participate in physical ownership.
// A selected update repairs only conflicts connected to its requested articles.
export function collectChangedMirrorOwners(
  plans: ArticleMirrorPlan[],
  records: Map<string, MirrorArticleRecord>,
  selectedArticleIds?: Set<string>
) {
  const ownersByPath = new Map<string | symbol, Set<string>>();
  const pathsByOwner = new Map<string, Set<string | symbol>>();
  const add = (articleId: string, relativePath: string | symbol) => {
    const key = typeof relativePath === 'string' ? mirrorPathKey(relativePath) : relativePath;
    const owners = ownersByPath.get(key) ?? new Set<string>();
    owners.add(articleId);
    ownersByPath.set(key, owners);
    const paths = pathsByOwner.get(articleId) ?? new Set<string | symbol>();
    paths.add(key);
    pathsByOwner.set(articleId, paths);
  };
  for (const plan of plans) add(plan.articleId, plan.relativePath);
  for (const record of records.values()) add(record.articleId, record.relativePath);
  for (const owners of collectChangedDirectoryOwnerGroups(plans, records)) {
    const key = Symbol();
    for (const owner of owners) add(owner, key);
  }
  const queue = [...(selectedArticleIds ?? pathsByOwner.keys())];
  const visited = new Set<string>();
  const visitedPaths = new Set<string | symbol>();
  const changedOwners = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const articleId = queue[index]!;
    if (visited.has(articleId)) continue;
    visited.add(articleId);
    for (const key of pathsByOwner.get(articleId) ?? []) {
      if (visitedPaths.has(key)) continue;
      visitedPaths.add(key);
      const owners = ownersByPath.get(key)!;
      if (owners.size < 2) continue;
      for (const owner of owners) {
        changedOwners.add(owner);
        if (!visited.has(owner)) queue.push(owner);
      }
    }
  }
  return changedOwners;
}

export function collectChangedMirrorPaths(
  expected: Map<string, MirrorArticleRecord>,
  current: Map<string, MirrorArticleRecord>
) {
  const changedPaths = new Set<string>();
  for (const articleId of new Set([...expected.keys(), ...current.keys()])) {
    const before = expected.get(articleId)?.relativePath;
    const after = current.get(articleId)?.relativePath;
    if (before === after) continue;
    if (before) changedPaths.add(mirrorPathKey(before));
    if (after) changedPaths.add(mirrorPathKey(after));
  }
  return changedPaths;
}
