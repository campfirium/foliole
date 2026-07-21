import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FolioleAideStorageInventory {
  bytes: number;
  complete: boolean;
  issueCount: number;
  path: string;
}

interface InventoryAccumulator {
  bytes: number;
  issueCount: number;
}

export async function inventoryFolioleAideStorage(
  rootPath: string
): Promise<FolioleAideStorageInventory> {
  const accumulator = { bytes: 0, issueCount: 0 };
  await inventoryEntry(rootPath, accumulator, true);
  return {
    bytes: accumulator.bytes,
    complete: accumulator.issueCount === 0,
    issueCount: accumulator.issueCount,
    path: rootPath
  };
}

async function inventoryEntry(
  entryPath: string,
  accumulator: InventoryAccumulator,
  isRoot = false
): Promise<void> {
  let stats;
  try {
    stats = await fs.lstat(entryPath);
  } catch (error) {
    if (isRoot && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
    accumulator.issueCount += 1;
    return;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    accumulator.bytes += stats.size;
    return;
  }
  let entries: string[];
  try {
    entries = await fs.readdir(entryPath);
  } catch {
    accumulator.issueCount += 1;
    return;
  }
  for (const entry of entries) {
    await inventoryEntry(path.join(entryPath, entry), accumulator);
  }
}
