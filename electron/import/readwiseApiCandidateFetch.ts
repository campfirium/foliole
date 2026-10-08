import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';

import { createReadwiseApiCandidateFactFetcher } from './readwiseApiCandidateFacts.js';
import { buildReadwiseApiCandidateIndex } from './readwiseApiCandidateIndex.js';
import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { assertReadwiseApiScopeAllowed, type ReadwiseApiScopePurpose } from './readwiseApiScopeGate.js';

export async function ensureReadwiseApiCandidateIndex(
  settings: ImportManagerSettings,
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {},
  purpose: ReadwiseApiScopePurpose = 'api',
  onIndexProgress: ((processed: number) => void) | undefined = undefined
) {
  await runWithDatabaseConnectionOwner(() => assertReadwiseApiScopeAllowed(purpose));
  await buildReadwiseApiCandidateIndex({ connectionRef, dependencies, includeParentContent: false,
    ...(onIndexProgress ? { onProgress: onIndexProgress } : {}), settings
  });
  return runWithDatabaseConnectionOwner(() => loadReadwiseApiCandidates(connectionRef));
}

export async function fetchReadwiseApiCandidateFacts(
  connectionRef: string,
  candidate: ReadwiseApiCandidate,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  return createReadwiseApiCandidateFactFetcher(connectionRef, dependencies)(candidate);
}

export { createReadwiseApiCandidateFactFetcher } from './readwiseApiCandidateFacts.js';
