import { createUnifiedMigrationLegacyFixture } from '../../lib/core/database/syncGroupUnifiedMigrationFixture';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { postResult } from './iosBridgeAcceptance';
import {
  runIosMigrationAcceptanceLeg,
  type IosMigrationFault
} from './iosSyncGroupMigrationAcceptanceHarness';
import { IosMigrationSecureStore } from './iosSyncGroupMigrationSecureStore';

const FAULTS: IosMigrationFault[] = ['none', 'registry', 'database', 'secure-store'];

export async function runIosSyncGroupMigrationAcceptance() {
  const fixture = createUnifiedMigrationLegacyFixture(32);
  const secureStore = new IosMigrationSecureStore(fixture.credentials);
  try {
    await secureStore.prepare();
    const legs = [];
    for (const fault of FAULTS) legs.push(await runIosMigrationAcceptanceLeg(secureStore, fault));
    verifyLegs(legs);
    const secureStoreEvidence = await secureStore.evidence();
    await FolioleCompanionSync.clearPairingCredentials();
    postResult({
      error: null,
      legs,
      phase: 'migration-verified',
      production_baseline: {
        companion_schema_version: COMPANION_DATABASE_VERSION,
        protocol_version: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version
      },
      scenario: 'sync-group-migration',
      secure_store: secureStoreEvidence,
      status: 'passed'
    });
  } catch (error) {
    await FolioleCompanionSync.clearPairingCredentials().catch(() => undefined);
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'sync-group-migration',
      status: 'failed'
    });
  }
}

function verifyLegs(legs: Array<Record<string, unknown>>) {
  const success = legs[0];
  if (!success) throw new Error('iOS unified migration success evidence is missing');
  const binding = success.active_binding as Record<string, unknown> | undefined;
  if (binding?.group_id !== 'group-a' || binding.library_id !== 'library-a' ||
      success.registry_phase !== 'committed' || success.protected_unchanged !== true ||
      JSON.stringify(success.versions_after_apply) !== '[33,33]' ||
      JSON.stringify(success.versions_after_rollback) !== '[32,32]') {
    throw new Error('iOS unified migration success/rollback evidence is incomplete');
  }
  for (const leg of legs.slice(1)) {
    const secure = leg.secure_store as Record<string, unknown> | undefined;
    if (leg.fault_observed !== true || leg.protected_unchanged !== true ||
        leg.registry_restored !== true || secure?.is_paired !== true ||
        JSON.stringify(leg.versions_after_recovery) !== '[32,32]') {
      throw new Error(`iOS unified migration ${String(leg.fault)} recovery evidence is incomplete`);
    }
  }
  const digests = legs.slice(1).map((leg) => (
    (leg.secure_store as Record<string, unknown>).credential_signature
  ));
  if (new Set(digests).size !== 1 || digests[0] === undefined) {
    throw new Error('iOS unified migration sealed credential evidence changed');
  }
}
