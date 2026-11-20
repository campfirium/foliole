import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import { z } from 'zod';

import type { SuperMemoMigrationSnapshot } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { resolveDatabasePath } from '../database/connection.js';

import { superMemoSourceFormatSchema } from './superMemoSourceFormatSchema.js';

const count = z.number().int().nonnegative();
const batchId = z.string().regex(/^[a-f0-9]{64}$/);
const grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export const panelSchema = z.object({
  step: z.enum(['load', 'structure', 'schedule', 'grades', 'complete', 'deleted', 'source', 'confirm']).optional(),
  elementCount: count.optional(),
  batchId: batchId.optional(),
  result: z.object({ imported: count, skipped: count, unresolvedImages: count }).optional()
});
export const linkSchema = z.object({
  filePath: z.string().min(1),
  collectionDirectory: z.string().min(1).nullable(),
  percent: z.number().min(0).max(100),
  gradeMap: z.array(grade).length(6).optional(),
  sourceFormat: superMemoSourceFormatSchema,
  folderChoices: z.array(z.object({ id: z.number().int().positive(), folder: z.boolean() })).optional(),
  comparison: z.object({ batchId, originalFilePath: z.string().min(1).optional() }).optional(),
  panel: panelSchema.optional(),
  deletedEntries: z.array(z.object({ sourceId: z.number().int().positive(), title: z.string(),
    status: z.enum(['trash', 'permanent']) })).optional(),
  collectionStamp: z.string().optional(),
  xmlHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  snapshot: z.custom<SuperMemoMigrationSnapshot>(value => {
    const snapshot = value as SuperMemoMigrationSnapshot | undefined;
    return Boolean(snapshot && Array.isArray(snapshot.elements) && Array.isArray(snapshot.preview?.rows));
  }).optional()
});

export const savedLinkSchema = linkSchema.required({ snapshot: true, xmlHash: true });

const migrationStoreSchema = z.object({
  activeFilePath: z.string().nullable(),
  sources: z.record(z.string(), savedLinkSchema)
});

export type SavedSuperMemoSource = z.infer<typeof savedLinkSchema>;
type MigrationStore = z.infer<typeof migrationStoreSchema>;

export function migrationStorePath() {
  const scope = createHash('sha256').update(resolveDatabasePath()).digest('hex');
  return path.join(app.getPath('userData'), 'supermemo-migration', `${scope}.json`);
}

export function readMigrationStore(file = migrationStorePath()): MigrationStore {
  if (!fs.existsSync(file)) return { activeFilePath: null, sources: {} };
  const stored: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (stored && typeof stored === 'object' && 'sources' in stored) return migrationStoreSchema.parse(stored);
  const legacy = savedLinkSchema.safeParse(stored);
  return legacy.success
    ? { activeFilePath: legacy.data.filePath, sources: { [legacy.data.filePath]: legacy.data } }
    : { activeFilePath: null, sources: {} };
}

export function activeMigrationSource(store = readMigrationStore()): SavedSuperMemoSource | undefined {
  return store.activeFilePath === null ? undefined : store.sources[store.activeFilePath];
}

export function writeMigrationStore(file: string, state: MigrationStore) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${file}.partial`, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(`${file}.partial`, file);
}

export function saveMigrationSource(file: string, store: MigrationStore, source: SavedSuperMemoSource) {
  writeMigrationStore(file, { activeFilePath: source.filePath, sources: { ...store.sources, [source.filePath]: source } });
}
