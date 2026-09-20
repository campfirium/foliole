import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { AttachmentObservationState } from '../../lib/platform/attachmentMaintenanceContract.js';
import { resolveAppPaths } from '../ipc/paths.js';

function statePath(databasePath: string) {
  const name = createHash('sha256').update(databasePath).digest('hex');
  return path.join(resolveAppPaths().app_data_dir, 'attachment-maintenance', `${name}.json`);
}

export function attachmentDatabaseGeneration(databasePath: string) {
  const stat = fs.statSync(databasePath);
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

export function readAttachmentObservationState(databasePath: string): AttachmentObservationState | null {
  const file = statePath(databasePath);
  if (!fs.existsSync(file)) return null;
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as AttachmentObservationState;
  if (!state || typeof state.databaseGeneration !== 'string' || typeof state.automatic !== 'boolean'
      || !Number.isSafeInteger(state.observationThreshold) || state.observationThreshold < 1
      || !state.counts || Object.values(state.counts).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('attachment_observation_state_invalid');
  }
  return state;
}

export function writeAttachmentObservationState(databasePath: string, state: AttachmentObservationState) {
  const file = statePath(databasePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.partial`, JSON.stringify(state));
  fs.renameSync(`${file}.partial`, file);
}
