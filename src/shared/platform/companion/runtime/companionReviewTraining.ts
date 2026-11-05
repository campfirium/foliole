import { resolveDesktopSettingIdentity } from '../../../../../lib/core/database/desktopSettingPolicy';
import { isSpecialRootNode } from '../../../../../lib/core/database/nodeMutationSpecialRoots';
import { readReviewTrainingInputWithDb, readReviewTrainingPlanWithDb } from '../../../../../lib/core/database/reviewTrainingInput';
import { parseReviewModels, reviewTrainingHistory, REVIEW_MODELS_SQL } from '../../../../../lib/core/database/reviewTrainingModels';
import { reviewModelKey, reviewTrainingModelSchema, type ReviewTrainingModel } from '../../../../../lib/core/review/trainingModel';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { saveIosSettingWithDb } from './iosCompanionActiveDatabaseWrites';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

const scopes = new WeakMap<CapacitorCompanionDatabaseOwner, string>();
function scopeFor(owner: CapacitorCompanionDatabaseOwner) {
  let scope = scopes.get(owner);
  if (!scope) { scope = crypto.randomUUID(); scopes.set(owner, scope); }
  return scope;
}
function assertOwner(owner: CapacitorCompanionDatabaseOwner, libraryScope: string) {
  if (getIosCompanionDatabaseOwner() !== owner || scopeFor(owner) !== libraryScope) {
    throw new Error('review_training_library_changed');
  }
}

export function loadCompanionReviewTrainingPlan() {
  const owner = getIosCompanionDatabaseOwner();
  const scope = scopeFor(owner);
  return owner.read(db => {
    assertOwner(owner, scope);
    return readReviewTrainingPlanWithDb(db, scope);
  });
}

export async function loadCompanionReviewTrainingStatus() {
  const owner = getIosCompanionDatabaseOwner();
  const scope = scopeFor(owner);
  return owner.readInteractiveSnapshot(async db => {
    assertOwner(owner, scope);
    const models = parseReviewModels(await db.query<{ key: string; value_json: string }>(REVIEW_MODELS_SQL));
    const plan = reviewTrainingHistory(models);
    const [folder] = plan.lastTrainedFolderId === null ? [] : await db.query<{ title: string }>(
      "SELECT title FROM nodes WHERE id = ? AND kind = 'folder' AND deleted_at IS NULL", [plan.lastTrainedFolderId]);
    assertOwner(owner, scope);
    return { lastTrainedAt: plan.lastTrainedAt, lastTrainedFolderId: plan.lastTrainedFolderId,
      folderTitle: folder?.title ?? null };
  });
}

export function loadCompanionReviewTrainingInput(folderId: string | null, libraryScope: string) {
  const owner = getIosCompanionDatabaseOwner();
  return owner.read(db => {
    assertOwner(owner, libraryScope);
    return readReviewTrainingInputWithDb(db, folderId, libraryScope);
  });
}

export function saveCompanionReviewTrainingModel(value: ReviewTrainingModel, libraryScope: string) {
  const owner = getIosCompanionDatabaseOwner();
  const model = { ...reviewTrainingModelSchema.parse(value), trainedAt: new Date().toISOString() };
  if (model.folderId === null) throw new Error('review_training_folder_invalid');
  return runCompanionHighValueMutationTask(() => owner.runWriter(db => db.transaction(async tx => {
    assertOwner(owner, libraryScope);
    if (model.folderId !== null) {
      const [folder] = await tx.query('SELECT id FROM nodes WHERE id = ? AND kind = ? AND deleted_at IS NULL', [model.folderId, 'folder']);
      if (!folder || isSpecialRootNode(model.folderId)) throw new Error('review_training_folder_invalid');
    }
    const identity = resolveDesktopSettingIdentity(reviewModelKey(model.folderId), null)!;
    await saveIosSettingWithDb(tx, { key: identity.key, value_json: JSON.stringify(model),
      scope: identity.scope, platform: identity.platform, form_factor: identity.formFactor });
    return null;
  })), { kind: 'nodes', nodeIds: [] });
}
