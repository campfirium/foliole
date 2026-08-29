import {
  readIosCompanionDatabase,
  writeIosCompanionDatabase
} from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';

const PHASE_KEY = 'ios_sync_pack_acceptance_phase';
export const IOS_SYNC_PACK_ACCEPTANCE_PHASES = [
  'apply', 'reapply', 'wrong-target', 'cursor-gap'
] as const;
export type IosSyncPackAcceptancePhase = typeof IOS_SYNC_PACK_ACCEPTANCE_PHASES[number];

export async function loadIosSyncPackAcceptancePhase(): Promise<IosSyncPackAcceptancePhase> {
  const rows = await readIosCompanionDatabase((db) => db.query<{ value: string }>(
    'SELECT value FROM companion_meta WHERE key = ? LIMIT 1', [PHASE_KEY]
  ));
  const value = rows[0]?.value;
  return IOS_SYNC_PACK_ACCEPTANCE_PHASES.includes(value as IosSyncPackAcceptancePhase)
    ? value as IosSyncPackAcceptancePhase
    : 'apply';
}

export async function advanceIosSyncPackAcceptancePhase(phase: IosSyncPackAcceptancePhase) {
  const next = IOS_SYNC_PACK_ACCEPTANCE_PHASES[IOS_SYNC_PACK_ACCEPTANCE_PHASES.indexOf(phase) + 1];
  if (!next) return;
  await writeIosCompanionDatabase((db) => db.run(
    `INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [PHASE_KEY, next, new Date().toISOString()]
  ));
}
