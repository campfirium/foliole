import {
  parseSyncPackDependencyTransfers, SYNC_PACK_DEPENDENCY_MAX_ROWS,
  type SyncPackDependencyPage, type SyncPackDependencyTransfer
} from './syncPackDependencyTransfer.js';

export type SyncPackDependencyPageHeader = Omit<SyncPackDependencyPage, 'rows'> & { rowCount: number };
export interface SyncPackDependencyManifest {
  dependencyPage?: SyncPackDependencyPageHeader;
  dependencyTransfers?: SyncPackDependencyTransfer[];
}

export function parseSyncPackDependencyManifest(value: Record<string, unknown>): SyncPackDependencyManifest {
  const dependencyTransfers = parseSyncPackDependencyTransfers(value.dependency_transfers);
  const raw = value.dependency_page;
  if (raw === undefined) return dependencyTransfers ? { dependencyTransfers } : {};
  if (dependencyTransfers || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('sync_pack_dependency_manifest_invalid');
  }
  const page = raw as SyncPackDependencyPageHeader;
  const transfer = parseSyncPackDependencyTransfers([page.transfer])![0]!;
  if (!Number.isSafeInteger(page.afterRow) || page.afterRow < 0 ||
      !Number.isSafeInteger(page.rowCount) || page.rowCount < 1 ||
      page.rowCount > SYNC_PACK_DEPENDENCY_MAX_ROWS ||
      page.afterRow + page.rowCount > transfer.expectedRows ||
      ![page.beforeDigest, page.afterDigest].every((digest) =>
        typeof digest === 'string' && /^[a-f0-9]{64}$/u.test(digest))) {
    throw new Error('sync_pack_dependency_manifest_invalid');
  }
  return { dependencyPage: { transfer, afterRow: page.afterRow, rowCount: page.rowCount,
    beforeDigest: page.beforeDigest, afterDigest: page.afterDigest } };
}

export function dependencyManifestFields(input: SyncPackDependencyManifest) {
  return {
    ...(input.dependencyPage ? { dependency_page: input.dependencyPage } : {}),
    ...(input.dependencyTransfers?.length ? { dependency_transfers: input.dependencyTransfers } : {})
  };
}
