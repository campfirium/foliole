import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import {
  projectedEvents, selectProjectedRun, selectProjectedRunById
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
  const deadline = Date.now() + 2 * 60_000;
  while (Date.now() < deadline) {
    const projection = await readA5SyncEvents(options);
    try {
      return { projection: projection.manifestPath,
        run: selectProjectedRun(projection.events, triggerReason, { exclude }) };
    } catch (error) {
      if (!(error instanceof Error)
          || error.message !== `No new completed ${triggerReason} mobile Sync run was projected.`) {
        throw error;
      }
    }
    await delay(30_000);
  }
  throw new Error(`No new completed ${triggerReason} mobile Sync run was projected.`);
}

export async function captureA5ActionRun(options, actionManifestPath) {
  const action = JSON.parse(fs.readFileSync(actionManifestPath, 'utf8')).receipt;
  const runId = action?.terminalRunId;
  if (typeof runId !== 'string' || !runId) {
    throw new Error('Completed mobile Sync action identity is missing.');
  }
  const deadline = Date.now() + 2 * 60_000;
  while (Date.now() < deadline) {
    const projection = await readA5SyncEvents(options);
    try {
      return { projection: projection.manifestPath,
        run: selectProjectedRunById(projection.events, runId) };
    } catch (error) {
      if (!(error instanceof Error)
          || error.message !== `Completed mobile Sync run was not projected: ${runId}`) throw error;
    }
    await delay(30_000);
  }
  throw new Error(`Completed mobile Sync run was not projected: ${runId}`);
}
