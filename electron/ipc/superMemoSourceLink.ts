import path from 'node:path';

import type { RememberedSuperMemoSource } from '../../lib/platform/nativeSuperMemoImportContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { readSuperMemoDeletions } from '../import/readSuperMemoDeletions.js';

import { asString } from './commandParsers.js';
import { assertAuthorizedImportDirectoryPath, assertAuthorizedImportFilePath, restoreSelectedImportDirectory, restoreSelectedImportPaths } from './importPathAuthorization.js';
import { superMemoCollectionStamp } from './readSuperMemoCollection.js';
import { readSuperMemoSource } from './readSuperMemoSource.js';
import {
  activeMigrationSource, linkSchema, migrationStorePath, panelSchema, readMigrationStore, savedLinkSchema,
  saveMigrationSource, type SavedSuperMemoSource, writeMigrationStore
} from './superMemoMigrationStore.js';

function sourceSelection(link: SavedSuperMemoSource, deletedEntries = link.deletedEntries): RememberedSuperMemoSource {
  const { filePath, collectionDirectory, panel } = link;
  const savedForm = { percent: link.percent, sourceFormat: link.sourceFormat, gradeMap: link.gradeMap,
    priorityBoundaries: link.priorityBoundaries, folderChoices: link.folderChoices, comparison: link.comparison };
  return { filePath, name: path.basename(filePath), collectionDirectory: collectionDirectory ?? undefined,
    savedForm, snapshot: link.snapshot, ...(deletedEntries ? { deletedEntries } : {}), ...(panel ? { panel } : {}) };
}

export function getSuperMemoSourceSelection(refreshDeletions = false): RememberedSuperMemoSource | null {
  const file = migrationStorePath();
  const store = readMigrationStore(file);
  const link = activeMigrationSource(store);
  if (!link) return null;
  const batch = link.panel?.batchId ?? link.snapshot.preview.directoryUpdate?.batchId;
  if (!refreshDeletions || !batch) return sourceSelection(link);
  const entries = readSuperMemoDeletions(openDatabaseConnection().driver, batch);
  if (JSON.stringify(entries) !== JSON.stringify(link.deletedEntries ?? [])) {
    saveMigrationSource(file, store, { ...link, deletedEntries: entries });
  }
  return sourceSelection(link, entries);
}

export async function activateSavedSuperMemoSource(pickerPath: string): Promise<RememberedSuperMemoSource | null> {
  const file = migrationStorePath();
  const filePath = await assertAuthorizedImportFilePath(pickerPath);
  const store = readMigrationStore(file);
  const link = store.sources[filePath];
  if (!link) return null;
  if (store.activeFilePath !== filePath) writeMigrationStore(file, { ...store, activeFilePath: filePath });
  return sourceSelection(link);
}

export function clearSuperMemoSourceSelection() {
  const file = migrationStorePath();
  const store = readMigrationStore(file);
  if (store.activeFilePath !== null) writeMigrationStore(file, { ...store, activeFilePath: null });
  return null;
}

async function rememberLink(value: unknown, formOnly: boolean, snapshot: unknown, xmlHash: unknown) {
  const file = migrationStorePath();
  const store = readMigrationStore(file);
  const link = linkSchema.parse(value);
  if (formOnly) {
    const previous = activeMigrationSource(store);
    if (!previous || previous.filePath !== link.filePath || previous.collectionDirectory !== link.collectionDirectory) {
      throw new Error('supermemo_source_changed');
    }
    saveMigrationSource(file, store, { ...previous, percent: link.percent, sourceFormat: link.sourceFormat,
      ...(link.priorityBoundaries ? { priorityBoundaries: link.priorityBoundaries } : {}),
      ...(link.gradeMap ? { gradeMap: link.gradeMap } : {}), ...(link.folderChoices ? { folderChoices: link.folderChoices } : {}) });
  } else {
    const previousPath = store.activeFilePath;
    await assertPickerPaths(link, previousPath ?? undefined);
    const collectionStamp = link.collectionDirectory ? await superMemoCollectionStamp(link.collectionDirectory) : undefined;
    const current = readMigrationStore(file);
    if (current.activeFilePath !== previousPath) throw new Error('supermemo_source_changed');
    const deletedEntries = current.sources[link.filePath]?.deletedEntries;
    saveMigrationSource(file, current, savedLinkSchema.parse({ ...link, snapshot, xmlHash, collectionStamp, deletedEntries }));
  }
  return null;
}

function rememberPanel(args: Record<string, unknown>) {
  const file = migrationStorePath();
  const store = readMigrationStore(file);
  const link = activeMigrationSource(store);
  if (!link || link.filePath !== args.filePath || link.collectionDirectory !== args.collectionDirectory) {
    throw new Error('supermemo_source_changed');
  }
  saveMigrationSource(file, store, savedLinkSchema.parse({ ...link, panel: { ...link.panel, ...panelSchema.parse(args.panel) },
    ...(args.snapshot ? { snapshot: args.snapshot, comparison: undefined } : {}) }));
  return null;
}

async function assertPickerPaths(link: Pick<SavedSuperMemoSource, 'filePath' | 'comparison' | 'collectionDirectory'>, rememberedPath: string | undefined) {
  const files = [link.filePath, link.comparison?.originalFilePath].filter((item): item is string => item !== undefined);
  if (files.some(item => path.extname(item).toLowerCase() !== '.xml')) throw new Error('invalid_supermemo_xml_path');
  if (link.filePath !== rememberedPath && await assertAuthorizedImportFilePath(link.filePath) !== link.filePath) {
    throw new Error('Import file path changed.');
  }
  if (link.collectionDirectory && await assertAuthorizedImportDirectoryPath(link.collectionDirectory) !== link.collectionDirectory) {
    throw new Error('Import directory path changed.');
  }
}

async function readVerifiedXml(link: SavedSuperMemoSource) {
  await restoreSelectedImportPaths(link.filePath, null);
  const source = await readSuperMemoSource(link.filePath, null);
  if (source.xmlHash !== link.xmlHash) throw new Error('supermemo_xml_updated');
  return source;
}

async function reloadLink() {
  const link = activeMigrationSource();
  if (!link) return null;
  await restoreSelectedImportPaths(link.filePath, link.collectionDirectory);
  return readSuperMemoSource(link.filePath, link.collectionDirectory ?? undefined);
}

async function restoreLink(xmlOnly: boolean) {
  const link = activeMigrationSource();
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
  const link = activeMigrationSource();
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
  if (args.action === 'reload') return reloadLink();
  if (args.action === 'remember') return rememberLink(args.link, args.formOnly === true, args.snapshot, args.xmlHash);
  if (args.action === 'rememberPanel') return rememberPanel(args);
  return readSuperMemoSource(asString(args.filePath, 'filePath'), args.collectionDirectory == null
    ? args.collectionDirectory as null | undefined : asString(args.collectionDirectory, 'collectionDirectory'));
}
