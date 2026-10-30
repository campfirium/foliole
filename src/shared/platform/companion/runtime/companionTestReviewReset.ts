import { App } from '@capacitor/app';

import { resetItemReviewsWithDb } from '../../../../../lib/core/database/itemReviewReset';
import { restartDailyFlowItemReviews } from '../../../../../lib/core/flow/itemReviewResetFlow';
import { getCompanionRuntimeCapability } from '../../companionRuntimeCapabilities';
import { createCompanionUuid } from '../../companionUuid';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { companionDailyFlowSettings, ownedCompanionDailyFlowPersistence } from './companionDailyFlow';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export async function supportsCompanionTestReviewReset() {
  if (getCompanionRuntimeCapability().kind !== 'android-native') return false;
  return (await App.getInfo()).id === 'com.campfirium.foliole.android.acceptance';
}

export async function resetCompanionTestItemReviews() {
  if (!await supportsCompanionTestReviewReset()) throw new Error('Review reset requires the Android test app.');
  const owner = getIosCompanionDatabaseOwner();
  if (owner.platform !== 'android') throw new Error('Review reset requires the Android database.');
  return runCompanionHighValueMutationTask(() => {
    if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Review reset library changed.');
    return owner.runWriter(db => db.transaction(async tx => {
      const ids = await resetItemReviewsWithDb(tx, {
        hostName: await iosCompanionHostName(tx), now: new Date().toISOString(), createId: createCompanionUuid
      });
      const settings = companionDailyFlowSettings();
      await restartDailyFlowItemReviews(tx, ids, new Date().toISOString(), settings,
        ownedCompanionDailyFlowPersistence(settings));
      return ids;
    }));
  }, nodeIds => ({ kind: 'nodes', nodeIds: [], reviewNodeIds: nodeIds }));
}
