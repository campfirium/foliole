import { promises as fs } from 'node:fs';
import path from 'node:path';

import { dialog, type BrowserWindow } from 'electron';

import type {
  NativeExportSourceDispositionResult,
  NativeImportSourceDispositionResult
} from '../../lib/platform/nativeSourceDispositionContract.js';
import { restoreSourceDispositions } from '../database/sourceDispositionRestore.js';
import {
  listSourceDispositionRecords,
  mergeImportedSourceDispositionRecords,
  type SourceDisposition,
  type SourceDispositionImportRecord,
  type SourceDispositionRecord,
  type SourceDispositionKey
} from '../database/sourceDispositionStates.js';

const EXPORT_SCHEMA = 'foliole.savedSourceTopicHandling';
const EXPORT_VERSION = 1;

type ExportSourceKind = 'readwise_reader' | 'watched_folder';
type ExportState = 'deleted' | 'dismissed';
type ExportGroups = Record<ExportState, Record<ExportSourceKind, string[]>>;

interface SourceDispositionExportFile {
  app: 'Foliole';
  exportedAt: string;
  topics: ExportGroups;
  schema: typeof EXPORT_SCHEMA;
  version: typeof EXPORT_VERSION;
}

function toExportSourceKind(sourceKind: SourceDispositionKey['sourceKind']): ExportSourceKind {
  return sourceKind === 'readwise' ? 'readwise_reader' : 'watched_folder';
}

function toExportState(disposition: SourceDisposition): ExportState {
  return disposition === 'dismissed' ? 'dismissed' : 'deleted';
}

function toImportSourceKind(source: ExportSourceKind): SourceDispositionKey['sourceKind'] {
  return source === 'readwise_reader' ? 'readwise' : 'keep';
}

function toImportDisposition(state: ExportState): SourceDisposition {
  return state === 'dismissed' ? 'dismissed' : 'soft_deleted';
}

function createEmptyExportGroups(): ExportGroups {
  return {
    deleted: {
      readwise_reader: [],
      watched_folder: []
    },
    dismissed: {
      readwise_reader: [],
      watched_folder: []
    }
  };
}

function toExportGroups(records: SourceDispositionRecord[]) {
  const groups = createEmptyExportGroups();
  for (const record of records) {
    groups[toExportState(record.disposition)][toExportSourceKind(record.sourceKind)].push(record.originalTitle);
  }
  return groups;
}

function readTitleList(value: unknown) {
  return Array.isArray(value) && value.every((title) => typeof title === 'string' && title.trim().length > 0)
    ? value.map((title) => title.trim())
    : null;
}

function parseExportGroups(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const topics = value as Record<string, unknown>;
  const records: SourceDispositionImportRecord[] = [];
  for (const state of ['dismissed', 'deleted'] as const) {
    const stateGroup = topics[state];
    if (!stateGroup || typeof stateGroup !== 'object' || Array.isArray(stateGroup)) return null;
    const sourceGroups = stateGroup as Record<string, unknown>;
    for (const source of ['watched_folder', 'readwise_reader'] as const) {
      const titles = readTitleList(sourceGroups[source]);
      if (!titles) return null;
      records.push(...titles.map((title) => ({
        disposition: toImportDisposition(state),
        originalTitle: title,
        sourceKind: toImportSourceKind(source)
      })));
    }
  }
  return records;
}

export function renderSourceDispositionText(records: SourceDispositionRecord[], exportedAt: string) {
  const file: SourceDispositionExportFile = {
    app: 'Foliole',
    exportedAt,
    schema: EXPORT_SCHEMA,
    topics: toExportGroups(records),
    version: EXPORT_VERSION
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseSourceDispositionText(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const file = parsed as Record<string, unknown>;
  if (file.app !== 'Foliole' || file.schema !== EXPORT_SCHEMA || file.version !== EXPORT_VERSION) {
    return null;
  }
  return parseExportGroups(file.topics);
}

export async function exportSourceDispositions(window: BrowserWindow | null): Promise<NativeExportSourceDispositionResult> {
  const records = listSourceDispositionRecords();
  const selection = window
    ? await dialog.showSaveDialog(window, {
        buttonLabel: 'Export',
        defaultPath: 'foliole-source-topic-handling.json',
        filters: [{ extensions: ['json'], name: 'JSON files' }],
        title: 'Export saved source topic handling'
      })
    : await dialog.showSaveDialog({
        buttonLabel: 'Export',
        defaultPath: 'foliole-source-topic-handling.json',
        filters: [{ extensions: ['json'], name: 'JSON files' }],
        title: 'Export saved source topic handling'
      });
  if (selection.canceled || !selection.filePath) {
    return { entryCount: 0, path: null, status: 'cancelled' };
  }
  try {
    await fs.mkdir(path.dirname(selection.filePath), { recursive: true });
    await fs.writeFile(selection.filePath, renderSourceDispositionText(records, new Date().toISOString()), 'utf8');
    return { entryCount: records.length, path: selection.filePath, status: 'saved' };
  } catch {
    return { entryCount: 0, path: null, status: 'save_failed' };
  }
}

export async function importSourceDispositions(window: BrowserWindow | null): Promise<NativeImportSourceDispositionResult> {
  const selection = window
    ? await dialog.showOpenDialog(window, {
        filters: [{ extensions: ['json'], name: 'JSON files' }],
        properties: ['openFile'],
        title: 'Import saved source topic handling'
      })
    : await dialog.showOpenDialog({
        filters: [{ extensions: ['json'], name: 'JSON files' }],
        properties: ['openFile'],
        title: 'Import saved source topic handling'
      });
  if (selection.canceled || selection.filePaths.length === 0) {
    return { importedCount: 0, status: 'cancelled', summary: null };
  }
  const filePath = selection.filePaths[0];
  if (!filePath) {
    return { importedCount: 0, status: 'cancelled', summary: null };
  }
  try {
    const records = parseSourceDispositionText(await fs.readFile(filePath, 'utf8'));
    if (!records) {
      return { importedCount: 0, status: 'invalid_file', summary: null };
    }
    const mergeResult = mergeImportedSourceDispositionRecords(records);
    const restoreResult = restoreSourceDispositions();
    return {
      appliedDeletedCount: restoreResult.trashedCount,
      appliedDismissedCount: restoreResult.dismissedCount,
      importedCount: mergeResult.importedCount,
      status: 'imported',
      summary: mergeResult.summary
    };
  } catch {
    return { importedCount: 0, status: 'read_failed', summary: null };
  }
}
