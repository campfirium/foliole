import { ANDROID_COMPANION_CONVERGENCE_MUTATION_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionConvergenceMutationDefinitions';
import { ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionConvergenceQueryDefinitions';
import type { DbRow } from '../../../../../lib/core/sync/dbPort';
import { isAvailableNativeCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';
import { iosCompanionContentHash, iosCompanionDeviceId, markIosCompanionMutation } from './iosCompanionMutationState';

export interface CompanionNodeTextAlternative {
  alternative_id: string;
  body_text: string;
  created_at: string;
  node_id: string;
  source_device_id: string;
  source_version_id: string;
  status: 'available' | 'dismissed' | 'promoted' | 'superseded';
  updated_at: string;
}

export async function loadCompanionNodeTextAlternative(nodeId: string) {
  if (!isAvailableNativeCompanionRuntime()) return null;
  return readIosCompanionDatabase(async (db) => {
    const rows = await db.query<CompanionNodeTextAlternative & DbRow>(
      ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS.nodeTextAlternativeAvailable.sql,
      [nodeId]
    );
    return rows[0] ?? null;
  });
}

export async function updateCompanionNodeTextAlternativeStatus(
  alternativeId: string,
  status: 'dismissed' | 'promoted'
): Promise<CompanionNodeTextAlternative> {
  return writeIosCompanionDatabase((db) => db.transaction(async (tx) => {
    const updatedAt = new Date().toISOString();
    await tx.run(ANDROID_COMPANION_CONVERGENCE_MUTATION_DEFINITIONS.nodeTextAlternativeUpdateStatus, [
      status, updatedAt, alternativeId
    ]);
    const alternative = (await tx.query<CompanionNodeTextAlternative & DbRow>(
      ANDROID_COMPANION_CONVERGENCE_QUERY_DEFINITIONS.nodeTextAlternativeById.sql,
      [alternativeId]
    ))[0];
    if (!alternative) throw new Error('Alternative not found.');
    const deviceId = await iosCompanionDeviceId(tx);
    await markIosCompanionMutation({
      contentHash: await iosCompanionContentHash(alternative),
      db: tx,
      deviceId,
      objectId: alternativeId,
      objectType: 'node_text_alternative',
      updatedAt
    });
    return alternative;
  }));
}
