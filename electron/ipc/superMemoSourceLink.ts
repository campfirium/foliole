import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import { z } from 'zod';

import type { RememberedSuperMemoSource, SuperMemoMigrationSnapshot } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { resolveDatabasePath } from '../database/connection.js';

import { asString } from './commandParsers.js';
import { assertAuthorizedImportDirectoryPath, assertAuthorizedImportFilePath, restoreSelectedImportDirectory, restoreSelectedImportPaths } from './importPathAuthorization.js';
import { superMemoCollectionStamp } from './readSuperMemoCollection.js';
import { readSuperMemoSource } from './readSuperMemoSource.js';
import { superMemoSourceFormatSchema } from './superMemoSourceFormatSchema.js';

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
  sourceFormat: superMemoSourceFormatSchema,
  folderChoices: z.array(z.object({ id: z.number().int().positive(), folder: z.boolean() })).optional(),
  comparison: z.object({ batchId, originalFilePath: z.string().min(1).optional() }).optional(),
  panel: panelSchema.optional(),
  collectionStamp: z.string().optional(),
  xmlHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  snapshot: z.custom<SuperMemoMigrationSnapshot>(value => {
    const snapshot = value as SuperMemoMigrationSnapshot | undefined;
    return Boolean(snapshot && Array.isArray(snapshot.elements) && Array.isArray(snapshot.preview?.rows));
  }).optional()
});

function linkPath() {
  const scope = createHash('sha256').update(resolveDatabasePath()).digest('hex');
  return path.join(app.getPath('userData'), 'supermemo-migration', `${scope}.json`);
}

const savedLinkSchema = linkSchema.required({ snapshot: true, xmlHash: true });

function readLink(file = linkPath()) {
  if (!fs.existsSync(file)) return null;
  const parsed = savedLinkSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  return parsed.success ? parsed.data : null;
}

export function getSuperMemoSourceSelection(): RememberedSuperMemoSource | null {
  const link = readLink();
  if (!link) return null;
  const { filePath, collectionDirectory, panel } = link;
  const savedForm = { percent: link.percent, sourceFormat: link.sourceFormat, gradeMap: link.gradeMap,
    folderChoices: link.folderChoices, comparison: link.comparison };
  return { filePath, name: path.basename(filePath), collectionDirectory: collectionDirectory ?? undefined,
    savedForm, snapshot: link.snapshot, ...(panel ? { panel } : {}) };
}

export function clearSuperMemoSourceSelection() {
  fs.rmSync(linkPath(), { force: true });
  return null;
}

async function rememberLink(value: unknown, formOnly: boolean, snapshot: unknown, xmlHash: unknown) {
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
    await assertPickerPaths(link, readLink(file)?.filePath);
    const collectionStamp = link.collectionDirectory ? await superMemoCollectionStamp(link.collectionDirectory) : undefined;
    writeLink(file, savedLinkSchema.parse({ ...link, snapshot, xmlHash, collectionStamp }));
  }
  return null;
}

function rememberPanel(args: Record<string, unknown>) {
  const file = linkPath();
  const link = readLink(file);
  if (!link || link.filePath !== args.filePath || link.collectionDirectory !== args.collectionDirectory) {
    throw new Error('supermemo_source_changed');
  }
  writeLink(file, linkSchema.parse({ ...link, panel: { ...link.panel, ...panelSchema.parse(args.panel) },
    ...(args.snapshot ? { snapshot: args.snapshot, comparison: undefined } : {}) }));
  return null;
}

async function assertPickerPaths(link: z.infer<typeof linkSchema>, rememberedPath: string | undefined) {
  const files = [link.filePath, link.comparison?.originalFilePath].filter((item): item is string => item !== undefined);
  if (files.some(item => path.extname(item).toLowerCase() !== '.xml')) throw new Error('invalid_supermemo_xml_path');
  if (link.filePath !== rememberedPath && await assertAuthorizedImportFilePath(link.filePath) !== link.filePath) {
    throw new Error('Import file path changed.');
  }
  if (link.collectionDirectory && await assertAuthorizedImportDirectoryPath(link.collectionDirectory) !== link.collectionDirectory) {
    throw new Error('Import directory path changed.');
  }
}

function writeLink(file: string, link: z.infer<typeof linkSchema>) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${file}.partial`, JSON.stringify(link), { mode: 0o600 });
  fs.renameSync(`${file}.partial`, file);
}

async function readVerifiedXml(link: z.infer<typeof savedLinkSchema>) {
  await restoreSelectedImportPaths(link.filePath, null);
  const source = await readSuperMemoSource(link.filePath, null);
  if (source.xmlHash !== link.xmlHash) throw new Error('supermemo_xml_updated');
  return source;
}

async function restoreLink(xmlOnly: boolean) {
  const link = readLink();
  if (!link) return null;
  const source = await readVerifiedXml(link);
  if (xmlOnly) return source;
  if (link.collectionDirectory) {
    try {
      await restoreSelectedImportPaths(link.filePath, link.collectionDirectory);
      await verifyCollection(link.collectionDirectory, link.collectionStamp);
    } catch (error) {
      if (String(error).includes('supermemo_collection_updated')) throw error;
      throw new Error('supermemo_collection_unreadable', { cause: error });
    }
  }
  return { ...source, collectionDirectory: link.collectionDirectory ?? undefined };
}

async function verifyCollection(directory: string, stamp: string | undefined) {
  if (stamp && await superMemoCollectionStamp(directory) !== stamp) throw new Error('supermemo_collection_updated');
}

async function checkLink() {
  const link = readLink();
  if (!link) return null;
  const source = await readVerifiedXml(link).catch(error => {
    if (String(error).includes('supermemo_xml_updated')) throw error;
    return null;
  });
  if (link.collectionDirectory && link.collectionStamp) {
    try {
      await restoreSelectedImportDirectory(link.collectionDirectory);
      await verifyCollection(link.collectionDirectory, link.collectionStamp);
    } catch (error) {
      if (String(error).includes('supermemo_collection_updated')) throw error;
    }
  }
  return source;
}

export function handleSuperMemoSource(args: Record<string, unknown>) {
  if (args.action === 'restore') return restoreLink(args.xmlOnly === true);
  if (args.action === 'check') return checkLink();
  if (args.action === 'remember') return rememberLink(args.link, args.formOnly === true, args.snapshot, args.xmlHash);
  if (args.action === 'rememberPanel') return rememberPanel(args);
  return readSuperMemoSource(asString(args.filePath, 'filePath'), args.collectionDirectory == null
    ? args.collectionDirectory as null | undefined : asString(args.collectionDirectory, 'collectionDirectory'));
}
