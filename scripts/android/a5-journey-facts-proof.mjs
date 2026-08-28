import fs from 'node:fs';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';

export async function observeA5JourneyFacts(args, buildIdentity, env, evidenceRoot,
  expectedJourneyCounts) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'observe-journey-facts',
    appId: ACCEPTANCE_APP_ID, buildIdentity, env, evidenceRoot,
    execute: args.execute, expectedJourneyCounts, installMain: false,
    paths: args.paths, serial: args.serial });
  return JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).receipt;
}
