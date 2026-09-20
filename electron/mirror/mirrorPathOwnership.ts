import type { ArticleMirrorPlan } from './articleMirrorPlanning.js';
import type { MirrorArticleRecord } from './mirrorOutputStorage.js';
import { mirrorPathKey } from './mirrorPathIdentity.js';

// Existing records may alias a target now assigned to a different article.
// Refresh both owners through the normal sync so a valid timestamp cannot hide an overwritten body.
export function collectChangedMirrorOwners(plans: ArticleMirrorPlan[], records: Map<string, MirrorArticleRecord>) {
  const ownersByPath = new Map(plans.map((plan) => [mirrorPathKey(plan.relativePath), plan.articleId]));
  const changedOwners = new Set<string>();
  for (const record of records.values()) {
    const owner = ownersByPath.get(mirrorPathKey(record.relativePath));
    if (owner && owner !== record.articleId) {
      changedOwners.add(owner);
      changedOwners.add(record.articleId);
    }
  }
  return changedOwners;
}
