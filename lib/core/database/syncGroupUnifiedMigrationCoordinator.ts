import type {
  LegacySecureCredentialEvidence,
  UnifiedInstallationRegistrySnapshot,
  UnifiedMigrationDecision,
  UnifiedSecureStoreSnapshot
} from '../../platform/syncGroupUnifiedContract.js';
import type { DbPort } from '../sync/dbPort.js';

import { digestUnifiedMigrationValue } from './syncGroupUnifiedDigest.js';
import {
  applyUnifiedLibraryMigration,
  markUnifiedLibraryMigrationCommitted,
  readLegacyUnifiedLibrarySnapshot,
  rollbackUnifiedLibraryMigration
} from './syncGroupUnifiedMigrationExecutor.js';
import { createUnifiedMigrationDecision } from './syncGroupUnifiedMigrationModel.js';
import type { UnifiedInstallationRegistryPort } from './syncGroupUnifiedRegistryStore.js';

export interface UnifiedLegacySecureStorePort {
  inspect(): Promise<LegacySecureCredentialEvidence[]>;
  restore(snapshot: UnifiedSecureStoreSnapshot): Promise<void>;
  seal(): Promise<UnifiedSecureStoreSnapshot>;
  verify(snapshot: UnifiedSecureStoreSnapshot): Promise<void>;
}

export interface UnifiedMigrationLibraryPort {
  db: DbPort;
  legacy_version: number;
  library_id: string;
  target_version: number;
}

export interface UnifiedMigrationCoordinatorInput {
  create_installation_id: () => string;
  current_library_id: string;
  journal_id: string;
  libraries: UnifiedMigrationLibraryPort[];
  now: string;
  registry: UnifiedInstallationRegistryPort;
  secure_store: UnifiedLegacySecureStorePort;
}

export interface UnifiedMigrationApplyResult {
  decision: UnifiedMigrationDecision;
  decision_digest: string;
  journal_id: string;
}

export async function previewUnifiedMigration(input: UnifiedMigrationCoordinatorInput) {
  const [registry, credentials, libraries] = await Promise.all([
    input.registry.read(),
    input.secure_store.inspect(),
    Promise.all(input.libraries.map((library) => (
      readLegacyUnifiedLibrarySnapshot(library.db, library.library_id)
    )))
  ]);
  const installationId = registry.installation_id ?? input.create_installation_id();
  return createUnifiedMigrationDecision({
    credentials,
    current_library_id: input.current_library_id,
    installation_id: installationId,
    libraries,
    registry
  });
}

export async function applyUnifiedMigration(
  input: UnifiedMigrationCoordinatorInput
): Promise<UnifiedMigrationApplyResult> {
  const previous = await input.registry.read();
  const secureSnapshot = await input.secure_store.seal();
  const decision = await previewWithSnapshots(input, previous);
  const decisionDigest = await digestUnifiedMigrationValue(decision);
  const applied: UnifiedMigrationLibraryPort[] = [];
  try {
    await input.registry.write(registryWithJournal(previous, decision.installation_id, {
      decisionDigest, input, phase: 'prepared', secureSnapshot
    }));
    for (const library of input.libraries) {
      const libraryDecision = decision.libraries.find((item) => item.library_id === library.library_id);
      if (!libraryDecision) throw new Error(`unified migration decision missing library ${library.library_id}`);
      await applyUnifiedLibraryMigration(library.db, {
        decision_digest: decisionDigest,
        journal_id: input.journal_id,
        legacy_version: library.legacy_version,
        library: libraryDecision,
        now: input.now,
        target_version: library.target_version
      });
      applied.push(library);
    }
    await input.registry.write(registryWithJournal(previous, decision.installation_id, {
      decisionDigest, input, phase: 'databases_applied', secureSnapshot
    }));
    await input.secure_store.verify(secureSnapshot);
    for (const library of applied) {
      await markUnifiedLibraryMigrationCommitted(library.db, input.journal_id, input.now);
    }
    await input.registry.write({
      active_binding: decision.active_binding,
      installation_id: decision.installation_id,
      journal: journal(previous, { decisionDigest, input, phase: 'committed', secureSnapshot }),
      revision: previous.revision + 1
    });
    return { decision, decision_digest: decisionDigest, journal_id: input.journal_id };
  } catch (error) {
    await restoreFailedMigration(input, previous, secureSnapshot, applied, error);
    throw error;
  }
}

export async function rollbackUnifiedMigration(input: UnifiedMigrationCoordinatorInput) {
  const current = await input.registry.read();
  const stored = current.journal;
  if (!stored || stored.journal_id !== input.journal_id || stored.phase !== 'committed') {
    throw new Error('unified migration committed registry journal missing');
  }
  await input.registry.write({ ...current, journal: { ...stored, phase: 'rolling_back', updated_at: input.now } });
  for (const library of [...input.libraries].reverse()) {
    await rollbackUnifiedLibraryMigration(library.db, input.journal_id);
  }
  await input.secure_store.restore(stored.secure_snapshot);
  await input.registry.write(stored.previous_registry);
}

async function previewWithSnapshots(
  input: UnifiedMigrationCoordinatorInput,
  registry: UnifiedInstallationRegistrySnapshot
) {
  const credentials = await input.secure_store.inspect();
  const libraries = await Promise.all(input.libraries.map((library) => (
    readLegacyUnifiedLibrarySnapshot(library.db, library.library_id)
  )));
  return createUnifiedMigrationDecision({
    credentials,
    current_library_id: input.current_library_id,
    installation_id: registry.installation_id ?? input.create_installation_id(),
    libraries,
    registry
  });
}

async function restoreFailedMigration(
  input: UnifiedMigrationCoordinatorInput,
  previous: UnifiedInstallationRegistrySnapshot,
  secureSnapshot: UnifiedSecureStoreSnapshot,
  applied: UnifiedMigrationLibraryPort[],
  original: unknown
) {
  const failures: unknown[] = [];
  for (const library of [...applied].reverse()) {
    try { await rollbackUnifiedLibraryMigration(library.db, input.journal_id); } catch (error) { failures.push(error); }
  }
  try { await input.secure_store.restore(secureSnapshot); } catch (error) { failures.push(error); }
  try { await input.registry.write(previous); } catch (error) { failures.push(error); }
  if (failures.length > 0 && original && typeof original === 'object') {
    try { Object.defineProperty(original, 'recoveryErrors', { value: failures }); } catch { /* original remains primary */ }
  }
}

function registryWithJournal(
  previous: UnifiedInstallationRegistrySnapshot,
  installationId: string,
  args: JournalArgs
): UnifiedInstallationRegistrySnapshot {
  return { active_binding: previous.active_binding, installation_id: installationId,
    journal: journal(previous, args), revision: previous.revision + 1 };
}

interface JournalArgs {
  decisionDigest: string;
  input: UnifiedMigrationCoordinatorInput;
  phase: 'prepared' | 'databases_applied' | 'committed';
  secureSnapshot: UnifiedSecureStoreSnapshot;
}

function journal(previous: UnifiedInstallationRegistrySnapshot, args: JournalArgs) {
  return {
    decision_digest: args.decisionDigest,
    journal_id: args.input.journal_id,
    phase: args.phase,
    previous_registry: structuredClone(previous),
    secure_snapshot: args.secureSnapshot,
    updated_at: args.input.now
  } as const;
}
