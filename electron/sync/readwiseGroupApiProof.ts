import { gunzipSync, gzipSync } from 'node:zlib';

import { normalizeReadwiseSourceMode,
  type ReadwiseSourceModeCompletion } from '../../lib/core/import/readwiseSourceMode.js';
import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
  normalizeReadwiseSourceCutover } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseSourceModeState } from '../database/readwiseSourceMode.js';
import { loadJsonSetting, writeJsonSetting } from '../database/settingsStore.js';

export type ApiProof = { completion: ReadwiseSourceModeCompletion; cutover: unknown };

export function parseApiProof(value: unknown): ApiProof {
  if (!value || typeof value !== 'object') throw new Error('readwise_api_proof_invalid');
  const proof = value as ApiProof;
  const cutover = normalizeReadwiseSourceCutover(proof.cutover);
  const completion = normalizeReadwiseSourceMode({
    completion: proof.completion, mode: 'api', version: 1
  }).completion;
  if (!cutover || cutover.version !== 2 || cutover.status !== 'api' ||
      cutover.completionVersion !== READWISE_SOURCE_CUTOVER_COMPLETION_VERSION ||
      !completion || completion.completedAt !== cutover.completedAt ||
      completion.startedAt !== cutover.startedAt || completion.sourceHost !== cutover.sourceHost ||
      completion.batchId !== (cutover.batchId ?? null)) throw new Error('readwise_api_proof_invalid');
  return { completion, cutover };
}

export function decodeApiProof(value: unknown) {
  if (typeof value !== 'string') throw new Error('readwise_api_proof_invalid');
  const body = gunzipSync(Buffer.from(value, 'base64'), { maxOutputLength: 8 * 1024 * 1024 });
  return parseApiProof(JSON.parse(body.toString('utf8')));
}

export function encodeApiProof(proof: ApiProof) {
  return gzipSync(JSON.stringify(proof)).toString('base64');
}

export function adoptApiProof(proof: ApiProof, sourceId: string) {
  const valid = parseApiProof(proof);
  const owner = loadReadwiseHostAssignment();
  if (!owner.legacy_unassigned && owner.active_device_identity_key !== sourceId) {
    throw new Error('readwise_owner_already_selected');
  }
  const existing = loadReadwiseSourceModeState();
  const existingCutover = normalizeReadwiseSourceCutover(loadJsonSetting('readwise_source_cutover_v2'));
  if (existingCutover?.status === 'migration-in-progress' ||
      (existingCutover?.status === 'api' && existingCutover.version === 2 &&
        (existingCutover.completedAt !== valid.completion.completedAt ||
          existingCutover.startedAt !== valid.completion.startedAt ||
          existingCutover.sourceHost !== valid.completion.sourceHost ||
          (existingCutover.batchId ?? null) !== valid.completion.batchId))) {
    throw new Error('readwise_api_migration_conflict');
  }
  if (existing.mode === 'api' && existing.completion) {
    if (JSON.stringify(existing.completion) !== JSON.stringify(valid.completion)) {
      throw new Error('readwise_api_migration_conflict');
    }
    return;
  }
  openDatabaseConnection().driver.transaction((driver) => {
    const now = new Date().toISOString();
    writeJsonSetting(driver, 'readwise_source_cutover_v2', valid.cutover, now);
    writeJsonSetting(driver, 'readwise_source_mode', {
      completion: valid.completion, mode: 'api', version: 1
    }, now);
    writeJsonSetting(driver, 'readwise_source_mode_conflict', { reasons: [], version: 1 }, now);
  });
  if (loadReadwiseSourceModeState().conflictReasons.length) throw new Error('readwise_api_proof_invalid');
}
