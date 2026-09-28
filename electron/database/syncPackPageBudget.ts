import { promises as fs } from 'node:fs';

import type { LoadedDesktopSyncPackRows } from './syncPackLoadedRows.js';

export interface SyncPackPageBudget {
  applyRows: number;
  databaseBytes: number;
  transferBytes: number;
}

// Provisional ceiling for one authenticated page; device acceptance may lower it.
export const DEFAULT_SYNC_PACK_PAGE_BUDGET: SyncPackPageBudget = {
  applyRows: 128,
  databaseBytes: 4 * 1024 * 1024,
  transferBytes: 1024 * 1024
};

export async function measureSyncPackPage(args: {
  archivePath: string;
  databasePath: string;
  rows: LoadedDesktopSyncPackRows;
}): Promise<SyncPackPageBudget> {
  const [archive, database] = await Promise.all([
    fs.stat(args.archivePath), fs.stat(args.databasePath)
  ]);
  const applyRows = Object.values(args.rows).reduce<number>((sum, value) =>
    sum + (Array.isArray(value) ? value.length : 0), 1);
  return { applyRows, databaseBytes: database.size,
    transferBytes: Math.ceil((archive.size + 16) / 3) * 4 + 512 };
}

export function syncPackPageFits(measured: SyncPackPageBudget, budget: SyncPackPageBudget) {
  return measured.applyRows <= budget.applyRows &&
    measured.databaseBytes <= budget.databaseBytes &&
    measured.transferBytes <= budget.transferBytes;
}
