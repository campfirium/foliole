import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, type BrowserWindow } from 'electron';
import { z } from 'zod';

import type { RememberedSuperMemoSource } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { resolveDatabasePath } from '../database/connection.js';

import { asString } from './commandParsers.js';
import { assertAuthorizedImportDirectoryPath, assertAuthorizedImportFilePath, restoreSelectedImportPaths } from './importPathAuthorization.js';
import { readSuperMemoSource, selectSuperMemoSource } from './readSuperMemoSource.js';

const count = z.number().int().nonnegative();
const batchId = z.string().regex(/^[a-f0-9]{64}$/);
const grade = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const panelSchema = z.object({
  step: z.enum(['load', 'structure', 'schedule', 'grades', 'source', 'confirm']).optional(),
  elementCount: count.optional(),
  batchId: batchId.optional(),
  result: z.object({ imported: count, skipped: count, unresolvedImages: count }).optional()
});
const linkSchema = z.object({
  filePath: z.string().min(1),
  collectionDirectory: z.string().min(1).nullable(),
  percent: z.number().min(0).max(100),
  gradeMap: z.array(grade).length(6).optional(),
  sourceFormat: z.object({ placement: z.enum(['metadata', 'body', 'topic-info', 'content-end']), template: z.string().max(4000) }),
  folderChoices: z.array(z.object({ id: z.number().int().positive(), folder: z.boolean() })).optional(),
  comparison: z.object({ batchId, originalFilePath: z.string().min(1).optional() }).optional(),
  panel: panelSchema.optional()
});

function linkPath() {
  const scope = createHash('sha256').update(resolveDatabasePath()).digest('hex');
  return path.join(app.getPath('userData'), 'supermemo-migration', `${scope}.json`);
}

function readLink(file = linkPath()) {
  return fs.existsSync(file) ? linkSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
}

export function getSuperMemoSourceSelection(): RememberedSuperMemoSource | null {
  const link = readLink();
  if (!link) return null;
  const { filePath, collectionDirectory, panel, ...savedForm } = link;
  return { filePath, name: path.basename(filePath), collectionDirectory: collectionDirectory ?? undefined,
    savedForm, ...(panel ? { panel } : {}) };
}

export function clearSuperMemoSourceSelection() {
  fs.rmSync(linkPath(), { force: true });
  return null;
}

async function rememberLink(value: unknown, formOnly: boolean) {
  const file = linkPath();
  const link = linkSchema.parse(value);
  if (formOnly) {
    const previous = readLink(file);
    if (!previous || previous.filePath !== link.filePath || previous.collectionDirectory !== link.collectionDirectory) {
      throw new Error('supermemo_source_changed');
    }
    writeLink(file, { ...previous, percent: link.percent, sourceFormat: link.sourceFormat,
      ...(link.gradeMap ? { gradeMap: link.gradeMap } : {}), ...(link.folderChoices ? { folderChoices: link.folderChoices } : {}) });
  } else {
    await assertPickerPaths(link);
    writeLink(file, link);
  }
  return null;
}

function rememberPanel(args: Record<string, unknown>) {
  const file = linkPath();
  const link = readLink(file);
  if (!link || link.filePath !== args.filePath || link.collectionDirectory !== args.collectionDirectory) {
    throw new Error('supermemo_source_changed');
  }
  writeLink(file, { ...link, panel: { ...link.panel, ...panelSchema.parse(args.panel) } });
  return null;
}

async function connectLink() {
  const link = readLink();
  if (link) await restoreSelectedImportPaths(link.filePath, link.collectionDirectory);
  return null;
}

async function assertPickerPaths(link: z.infer<typeof linkSchema>) {
  const files = [link.filePath, link.comparison?.originalFilePath].filter((item): item is string => item !== undefined);
  if (files.some(item => path.extname(item).toLowerCase() !== '.xml')) throw new Error('invalid_supermemo_xml_path');
  const canonical = await Promise.all(files.map(assertAuthorizedImportFilePath));
  if (files.some((item, index) => item !== canonical[index])) throw new Error('Import file path changed.');
  if (link.collectionDirectory && await assertAuthorizedImportDirectoryPath(link.collectionDirectory) !== link.collectionDirectory) {
    throw new Error('Import directory path changed.');
  }
}

function writeLink(file: string, link: z.infer<typeof linkSchema>) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${file}.partial`, JSON.stringify(link), { mode: 0o600 });
  fs.renameSync(`${file}.partial`, file);
}

async function restoreLink() {
  const remembered = getSuperMemoSourceSelection();
  if (!remembered) return null;
  const { filePath, collectionDirectory, savedForm } = remembered;
  await restoreSelectedImportPaths(filePath, null);
  try {
    if (collectionDirectory) await restoreSelectedImportPaths(filePath, collectionDirectory);
  } catch {
    const source = await readSuperMemoSource(filePath, null);
    return { ...source, collectionDirectory: collectionDirectory ?? undefined, collectionDiscoveryFailure: 'read' as const, savedForm };
  }
  return { ...await readSuperMemoSource(filePath, collectionDirectory ?? null), savedForm };
}

async function restoreComparison() {
  const filePath = readLink()?.comparison?.originalFilePath;
  if (!filePath) return null;
  await restoreSelectedImportPaths(filePath, null);
  return readSuperMemoSource(filePath, null);
}

export function handleSuperMemoSource(args: Record<string, unknown>, window: () => BrowserWindow | null) {
  if (args.action === 'connect') return connectLink();
  if (args.action === 'restore') return restoreLink();
  if (args.action === 'comparison') return restoreComparison();
  if (args.action === 'remember') return rememberLink(args.link, args.formOnly === true);
  if (args.action === 'rememberPanel') return rememberPanel(args);
  return args.filePath === undefined
    ? selectSuperMemoSource(window())
    : readSuperMemoSource(asString(args.filePath, 'filePath'), args.collectionDirectory == null
      ? args.collectionDirectory as null | undefined : asString(args.collectionDirectory, 'collectionDirectory'));
}
