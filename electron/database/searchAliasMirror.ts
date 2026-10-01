import { createHash } from 'node:crypto';
import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

import { parseSearchAliasDocument } from '../../lib/core/search/searchAliasDocument.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

import { openDatabaseConnection, registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from './connection.js';
import { notifySearchAliasesChanged } from './searchAliasEvents.js';
import {
  migrateLegacySearchAliasFile,
  preserveSearchAliasConflict,
  readOptionalText,
  searchAliasBaselinePath,
  searchAliasFilePath,
  writeTextAtomically
} from './searchAliasMirrorFiles.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const SETTING_KEY = 'search_aliases_document';
const TEMPLATE = '# One group per line. Separate spellings with |.\n# Hello | Hallo | Hola | Bonjour | Ciao | こんにちは | 안녕하세요 | Cześć | Olá | Привет | 你好\n';
const PREVIOUS_TEMPLATES = [
  '# One group per line. Separate spellings with |.\n# Disney | 迪士尼\n',
  '# One group per line. Separate spellings with |.\n# Incremental reading | 渐进阅读\n',
  '# One group per line. Separate spellings with |.\n# Hello | Hallo | Hola | Bonjour | Ciao | こんにちは | 안녕하세요 | Cześć | Olá | Привет | 你好 | 哈囉\n'
];
let watcher: FSWatcher | null = null;
let timer: NodeJS.Timeout | null = null;
let boundDatabasePath: string | null = null;
let lastError: string | null = null;
let effectiveGroups: string[][] = [];
let effectiveRevision = 0;

interface StoredDocument { version: 1; text: string }
interface MirrorBaseline { version: 1; hash: string }

function hash(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

function readDatabaseDocument(): string | null {
  const value = loadJsonSetting(SETTING_KEY);
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The saved search aliases document is invalid.');
  }
  const record = value as Partial<StoredDocument>;
  if (record.version !== 1 || typeof record.text !== 'string') {
    throw new Error('The saved search aliases document has an unsupported version.');
  }
  return parseSearchAliasDocument(record.text).text;
}

async function readBaseline(databasePath: string): Promise<string | null> {
  const source = await readOptionalText(searchAliasBaselinePath(databasePath));
  if (!source) return null;
  try {
    const value = JSON.parse(source) as Partial<MirrorBaseline>;
    return value.version === 1 && typeof value.hash === 'string' ? value.hash : null;
  } catch {
    return null;
  }
}

async function commitBaseline(databasePath: string, text: string) {
  await writeTextAtomically(searchAliasBaselinePath(databasePath), JSON.stringify({
    version: 1, hash: hash(text)
  } satisfies MirrorBaseline));
}

function commitDocument(text: string) {
  saveJsonSetting(SETTING_KEY, { version: 1, text } satisfies StoredDocument);
  void requestDesktopHighValueSync();
}

async function reconcileDocument(mode: 'normal' | 'restore') {
  const databasePath = openDatabaseConnection().dbPath;
  await migrateLegacySearchAliasFile(databasePath);
  const filePath = searchAliasFilePath(databasePath);
  const [source, baseline] = await Promise.all([
    readOptionalText(filePath), readBaseline(databasePath)
  ]);
  const databaseText = readDatabaseDocument();
  updateEffectiveGroups(databaseText ?? '');
  const fileText = source === null ? null : parseSearchAliasDocument(source).text;
  if (fileText === null && databaseText === null) {
    updateEffectiveGroups('');
    return;
  }
  if (fileText === null) {
    await writeTextAtomically(filePath, databaseText!);
    await commitBaseline(databasePath, databaseText!);
    updateEffectiveGroups(databaseText!);
    return;
  }
  if (databaseText === null) {
    if ((fileText === TEMPLATE || PREVIOUS_TEMPLATES.includes(fileText)) && baseline === null) {
      updateEffectiveGroups('');
      return;
    }
    commitDocument(fileText);
    await commitBaseline(databasePath, fileText);
    updateEffectiveGroups(fileText);
    return;
  }
  if (fileText === databaseText) {
    await commitBaseline(databasePath, fileText);
    updateEffectiveGroups(fileText);
    return;
  }
  if (mode === 'restore' || hash(databaseText) === baseline) {
    commitDocument(fileText);
    await commitBaseline(databasePath, fileText);
    updateEffectiveGroups(fileText);
    return;
  }
  if (hash(fileText) !== baseline) await preserveSearchAliasConflict(filePath);
  if (await readOptionalText(filePath) !== source) {
    throw new Error('The search aliases file changed during reconciliation. Retry after saving.');
  }
  await writeTextAtomically(filePath, databaseText);
  await commitBaseline(databasePath, databaseText);
  updateEffectiveGroups(databaseText);
}

function updateEffectiveGroups(text: string) {
  const groups = parseSearchAliasDocument(text).groups;
  if (JSON.stringify(groups) === JSON.stringify(effectiveGroups)) return;
  effectiveGroups = groups;
  effectiveRevision += 1;
  notifySearchAliasesChanged(effectiveRevision);
}

export function getEffectiveSearchAliases() {
  return { groups: effectiveGroups, revision: effectiveRevision };
}

export async function reconcileSearchAliasMirror(mode: 'normal' | 'restore' = 'normal') {
  try {
    await reconcileDocument(mode);
    lastError = null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lastError !== message) {
      void import('electron').then(({ Notification }) => {
        if (Notification.isSupported()) {
          new Notification({ title: 'Search aliases could not be updated', body: message }).show();
        }
      }).catch(() => {});
    }
    lastError = message;
    console.error('[search-aliases] mirror reconciliation failed', error);
    throw error;
  }
}

export function searchAliasMirrorStatus() {
  return { error: lastError, path: searchAliasFilePath(openDatabaseConnection().dbPath) };
}

export async function ensureSearchAliasFile() {
  const databasePath = openDatabaseConnection().dbPath;
  await migrateLegacySearchAliasFile(databasePath);
  const filePath = searchAliasFilePath(databasePath);
  if (await readOptionalText(filePath) !== null) return filePath;
  await reconcileSearchAliasMirror();
  if (await readOptionalText(filePath) === null) await writeTextAtomically(filePath, TEMPLATE);
  return filePath;
}

export function stopSearchAliasMirror() {
  watcher?.close();
  watcher = null;
  if (timer) clearTimeout(timer);
  timer = null;
  boundDatabasePath = null;
  effectiveGroups = [];
  effectiveRevision += 1;
}

export async function startSearchAliasMirror(mode: 'normal' | 'restore' = 'normal') {
  stopSearchAliasMirror();
  try {
    await reconcileSearchAliasMirror(mode);
  } catch {
    // Keep watching so a corrected file can be imported without restarting.
  }
  const databasePath = openDatabaseConnection().dbPath;
  const filePath = searchAliasFilePath(databasePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  boundDatabasePath = databasePath;
  watcher = watch(path.dirname(filePath), (_event, name) => {
    if (name && name.toString() !== 'search-aliases.txt') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (boundDatabasePath !== databasePath) return;
      void runWithDatabaseConnectionOwner(() => reconcileSearchAliasMirror()).catch(() => {});
    }, 150);
  });
}

registerDatabaseConnectionCleanup(stopSearchAliasMirror);
