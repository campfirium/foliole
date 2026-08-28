import fs from 'node:fs';

import {
  projectedEvents, selectProjectedRun
} from '../acceptance/t152-two-device-run-proof.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';

export async function readA5SyncEvents({ args, buildIdentity, env, evidenceRoot }) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'read-sync-events',
    appId: ACCEPTANCE_APP_ID, buildIdentity, env, evidenceRoot,
    execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
  const receipt = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).receipt;
  return { events: projectedEvents(receipt, ACCEPTANCE_APP_ID),
    manifestPath: result.manifestPath };
}

export async function captureA5SyncRun(options, triggerReason, exclude = []) {
  const projection = await readA5SyncEvents(options);
  return { projection: projection.manifestPath,
    run: selectProjectedRun(projection.events, triggerReason, { exclude }) };
}
