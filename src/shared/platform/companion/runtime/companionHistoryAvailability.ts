import { DocumentLoadRequests } from '../../../lib/documents/documentPreparation';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { getCompanionSyncMutationRevision } from '../sync/mutation/companionSyncMutationRevision';

import { readCompanionFlowHistoryAvailability } from './companionFlowHistoryStore';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

type Availability = Awaited<ReturnType<typeof readCompanionFlowHistoryAvailability>>;
const requests = new DocumentLoadRequests<Availability>();
let context: { owner: ReturnType<typeof getIosCompanionDatabaseOwner>; scope: object; revision: number } | undefined;

export async function loadCompanionFlowHistoryAvailability(key: string) {
  const owner = getIosCompanionDatabaseOwner();
  const scope = getCompanionReadingScope();
  const revision = getCompanionSyncMutationRevision();
  if (context?.owner !== owner || context.scope !== scope || context.revision !== revision) {
    requests.clear();
    context = { owner, scope, revision };
  }
  return (await requests.load(key, () => owner.read(db => readCompanionFlowHistoryAvailability(db, key))))!;
}
