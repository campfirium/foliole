import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { app } from 'electron';
import { z } from 'zod';

import type { SuperMemoMigrationSnapshot, SuperMemoMigrationStep } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { resolveDatabasePath } from '../database/connection.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { superMemoSourceFormatSchema } from './superMemoSourceFormatSchema.js';

const count = z.number().int().nonnegative();
const batchId = z.string().regex(/^[a-f0-9]{64}$/);
const grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const stepSchema = z.enum(['load', 'structure', 'schedule', 'grades', 'complete', 'deleted', 'source', 'confirm']);
export const panelSchema = z.object({
  step: stepSchema.optional(),
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

export const savedLinkSchema = linkSchema
  .extend({ panelRevision: z.string().optional() })
  .required({ snapshot: true, xmlHash: true });

const migrationStoreSchema = z.object({
  activeFilePath: z.string().nullable(),
  sources: z.record(z.string(), savedLinkSchema)
});

export type SavedSuperMemoSource = z.infer<typeof savedLinkSchema>;
type MigrationStore = z.infer<typeof migrationStoreSchema>;
type PanelIdentity = Pick<SavedSuperMemoSource, 'filePath' | 'collectionDirectory' | 'panelRevision'>;
const savedStepSchema = z.object({ panelRevision: z.string().nullable(), step: stepSchema });
type SavedStep = z.infer<typeof savedStepSchema>;

let activePanel: { file: string; identity: PanelIdentity | undefined } | undefined;
const pendingStepWrites = new Map<string, Promise<void>>();

export function migrationStorePath() {
  const scope = createHash('sha256').update(resolveDatabasePath()).digest('hex');
  return path.join(app.getPath('userData'), 'supermemo-migration', `${scope}.json`);
}

function parseMigrationStore(stored: unknown): MigrationStore {
  if (stored && typeof stored === 'object' && 'sources' in stored) return migrationStoreSchema.parse(stored);
  const legacy = savedLinkSchema.safeParse(stored);
  return legacy.success
    ? { activeFilePath: legacy.data.filePath, sources: { [legacy.data.filePath]: legacy.data } }
    : { activeFilePath: null, sources: {} };
}

export function readMigrationStore(file = migrationStorePath()): MigrationStore {
  const state = fs.existsSync(file)
    ? parseMigrationStore(JSON.parse(fs.readFileSync(file, 'utf8')))
    : { activeFilePath: null, sources: {} };
  rememberActivePanel(file, state);
  return state;
}

export function activeMigrationSource(store = readMigrationStore()): SavedSuperMemoSource | undefined {
  return store.activeFilePath === null ? undefined : store.sources[store.activeFilePath];
}

export function writeMigrationStore(file: string, state: MigrationStore) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${file}.partial`, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(`${file}.partial`, file);
  rememberActivePanel(file, state);
}

export function saveMigrationSource(file: string, store: MigrationStore, source: SavedSuperMemoSource) {
  writeMigrationStore(file, { activeFilePath: source.filePath, sources: { ...store.sources, [source.filePath]: source } });
}

function rememberActivePanel(file: string, state: MigrationStore) {
  const active = activeMigrationSource(state);
  activePanel = { file, identity: active && {
    filePath: active.filePath,
    collectionDirectory: active.collectionDirectory,
    panelRevision: active.panelRevision
  } };
}

function migrationStepPath(file: string, sourcePath: string) {
  const key = createHash('sha256').update(sourcePath).digest('hex');
  return path.join(`${file}.steps`, `${key}.json`);
}

export async function readMigrationPanelStep(file: string, source: PanelIdentity) {
  const stepFile = migrationStepPath(file, source.filePath);
  await pendingStepWrites.get(stepFile)?.catch(() => undefined);
  try {
    const saved = savedStepSchema.parse(JSON.parse(await readFile(stepFile, 'utf8')));
    // A new source snapshot or import result supplies a new initial step.
    if (saved.panelRevision === (source.panelRevision ?? null)) return saved.step;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (!(error instanceof SyntaxError || error instanceof z.ZodError)) throw error;
    appendMainProcessDiagnosticLog('supermemo_migration_step_invalid', {}, 'warn');
  }
  return undefined;
}

async function writeMigrationPanelStep(file: string, value: SavedStep) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.partial`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function saveActiveMigrationPanelStep(
  file: string,
  requested: { filePath: unknown; collectionDirectory: unknown },
  step: SuperMemoMigrationStep
) {
  // The wizard reads or selects a source before saving its step. Retain only its identity.
  if (activePanel?.file !== file) readMigrationStore(file);
  const active = activePanel?.identity;
  if (!active || active.filePath !== requested.filePath || active.collectionDirectory !== requested.collectionDirectory) {
    throw new Error('supermemo_source_changed');
  }
  const stepFile = migrationStepPath(file, active.filePath);
  const value = { panelRevision: active.panelRevision ?? null, step };
  const previous = pendingStepWrites.get(stepFile) ?? Promise.resolve();
  const write = previous.catch(() => undefined).then(() => writeMigrationPanelStep(stepFile, value));
  pendingStepWrites.set(stepFile, write);
  try {
    await write;
  } finally {
    if (pendingStepWrites.get(stepFile) === write) pendingStepWrites.delete(stepFile);
  }
}
