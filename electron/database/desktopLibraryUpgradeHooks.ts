import type { DatabaseConnection } from './connection.js';
import { prepareLegacyAttachmentFiles } from './legacyAttachmentFiles.js';
import { migrateLegacyAttachmentReferences } from './legacyAttachmentReferenceMigration.js';
import { migrateLegacyBodyConsistency } from './legacyBodyConsistencyMigration.js';
import { seedLegacyResourceAvailability } from './legacyResourceAvailability.js';
import { migrateOrphanedInactiveReadingState } from './orphanedReadingStateMigration.js';

export interface DesktopLibraryUpgradeInput {
  assetsDir: string;
  attachmentTargets: ReadonlyMap<string, string>;
  fresh: boolean;
  hostName: string;
  version: number;
}

/**
 * Library data repairs owned by the schema transaction. This module must stay free of Electron
 * imports: the upgrade worker runs it on its own connection before the main process opens the library.
 */
export function runDesktopLibraryDataUpgrade(connection: Pick<DatabaseConnection, 'driver' | 'sqlite'>,
  input: DesktopLibraryUpgradeInput) {
  migrateLegacyBodyConsistency(connection, input.hostName, input.fresh);
  migrateOrphanedInactiveReadingState(connection);
  prepareLegacyAttachmentFiles(input.assetsDir, input.attachmentTargets);
  migrateLegacyAttachmentReferences(connection, input.attachmentTargets, input.hostName);
  if (input.version < 141) seedLegacyResourceAvailability(connection.sqlite, input.assetsDir);
}
