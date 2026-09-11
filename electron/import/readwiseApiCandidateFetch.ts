import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
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
  purpose: ReadwiseApiScopePurpose = 'api'
) {
  assertReadwiseApiScopeAllowed(purpose);
  await buildReadwiseApiCandidateIndex({ connectionRef, dependencies, settings });
  return loadReadwiseApiCandidates(connectionRef);
}

export async function fetchReadwiseApiCandidateFacts(
  connectionRef: string,
  candidate: ReadwiseApiCandidate,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  return createReadwiseApiCandidateFactFetcher(connectionRef, dependencies)(candidate);
}

export { createReadwiseApiCandidateFactFetcher } from './readwiseApiCandidateFacts.js';
