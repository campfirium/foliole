import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

import Database from 'better-sqlite3';

import { bootstrapCompanionDatabase, CompanionDatabaseBlockedError } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { NodeAnchorLinkPayload, NodeImageRegionGroupPayload, UpsertNodeSnapshotInput } from '../../lib/core/database/nodeMutationPayloads.js';
import { runLibraryMerge, type LibraryMergeHost, type LibraryMergeReport, type LibraryMergeSourceNode } from '../../lib/core/import/libraryMerge.js';
import { NODE_KINDS, type NodeKind } from '../../lib/core/nodes/nodeKind.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { snapshotBackupRestoreSource } from '../database/backupRestoreSourceSnapshot.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { createDatabaseRestoreArtifacts } from '../database/databaseRestoreArtifacts.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { verifySqliteDatabaseFileOffMainThread } from '../database/sqliteFileOffMainThread.js';

import { copyLibraryMergeAttachments } from './desktopLibraryMergeAttachments.js';
import { stageMobileLibrarySource } from './mobileLibraryMergeSource.js';

export interface DesktopLibraryMergeResult extends Omit<LibraryMergeReport, 'attachmentKeys'> {
  attachmentsCopied: number;
  attachmentsMissing: number;
  folderId: string | null;
}

const FOLDER_META_PREFIX = 'library-merge-folder:';

async function hashFile(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function parseJson<T>(value: unknown): T | null {
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function optionalBoolean(value: unknown) {
  return value === null || value === undefined ? null : value === 1;
}

/** The source row as a new node of this library; only the parent and the attachment rows are this library's own. */
export function libraryMergeNodeSnapshot(node: LibraryMergeSourceNode, parentId: string): UpsertNodeSnapshotInput {
  const kind = (NODE_KINDS as readonly string[]).includes(node.kind) ? node.kind as NodeKind : 'topic';
  const keepsParent = parentId === node.parent_id;
  const order = parseJson<unknown>(node.manual_child_order);
  return {
    // An anchor points into the parent's text, so it only holds under the same parent.
    anchorLink: keepsParent ? parseJson<NodeAnchorLinkPayload>(node.anchor_link) : null,
    content: node.content,
    createdAt: node.created_at,
    desiredRetention: node.desired_retention as number | null,
    enableShortTerm: optionalBoolean(node.enable_short_term),
    hideTitleHeading: node.hide_title_heading === 1,
    imageRegions: parseJson<NodeImageRegionGroupPayload[]>(node.image_regions),
    imageSources: parseJson<Record<string, string>>(node.image_sources),
    isTitleManual: node.is_title_manual === 1,
    kind,
    manualChildOrder: Array.isArray(order) && order.every(id => typeof id === 'string') ? order as string[] : null,
    nodeId: node.id,
    openingText: (node.opening_text as string | null) ?? null,
    parentNodeId: parentId,
    position: keepsParent ? node.position as number | null : null,
    priority: node.priority as number | null,
    reveal: (node.reveal as string | null) ?? null,
    sequentialReadingEnabled: optionalBoolean(node.sequential_reading_enabled),
    shelvedAt: (node.shelved_at as string | null) ?? null,
    title: node.title,
    updatedAt: node.updated_at,
    virtualFilter: null
  };
}

function desktopHost(fingerprint: string, folderTitle: string, now: string): LibraryMergeHost & { folderId: () => string | null } {
  let folderId: string | null = null;
  const key = `${FOLDER_META_PREFIX}${fingerprint}`;
  return {
    folderId: () => folderId,
    async findFolder(tx: DbPort) {
      if (folderId) return folderId;
      const [existing] = await tx.query<{ id: string }>(`SELECT n.id FROM workspace_meta m JOIN nodes n ON n.id = m.value
        WHERE m.key = ? AND n.kind = 'folder' AND n.deleted_at IS NULL`, [key]);
      return folderId = existing?.id ?? null;
    },
    async ensureFolder(tx: DbPort) {
      const found = await this.findFolder(tx);
      if (found) return found;
      const id = randomUUID();
      upsertNodeSnapshot({ nodeId: id, kind: 'folder', parentNodeId: null, position: null, title: folderTitle,
        isTitleManual: true, content: '', reveal: null, anchorLink: null, createdAt: now, updatedAt: now });
      await tx.run(`INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [key, id, now]);
      return folderId = id;
    },
    async createNode(tx: DbPort, node: LibraryMergeSourceNode, parentId: string) {
      upsertNodeSnapshot(libraryMergeNodeSnapshot(node, parentId));
      await tx.run('UPDATE nodes SET resource_references = ? WHERE id = ?', [node.resource_references ?? '[]', node.id]);
    },
    betweenBatches: async () => { await yieldToEventLoop(); }
  };
}

/** Each batch takes the shared connection for its own transaction, so the app keeps working between batches. */
function ownedPort(port: DbPort): DbPort {
  return { ...port, transaction: run => runWithDatabaseConnectionOwner(() => port.transaction(run)) } as DbPort;
}

function sourceTables(sqlite: Database.Database) {
  return new Set((sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
    .map(row => row.name));
}

/** Brings the private copy to the current schema: a phone library through its own migrations, a desktop one through the desktop's. */
async function migrateSource(sqlite: Database.Database, now: string) {
  const tables = sourceTables(sqlite);
  if (!tables.has('nodes') || !tables.has('review_log')) throw new Error('library_merge_source_not_library');
  if (!tables.has('companion_meta')) {
    initializeDatabaseSchema(sqlite);
    return;
  }
  const meta = sqlite.prepare("SELECT value FROM companion_meta WHERE key IN ('host_name', 'device_id') ORDER BY key DESC")
    .all() as { value: string }[];
  try {
    // The copy keeps its own host name, so its per-device state stays where it was.
    await bootstrapCompanionDatabase(createBetterSqliteDbPort(sqlite), {
      allowCreate: false, expectedHostName: meta.find(row => row.value?.trim())?.value ?? 'phone', now });
  } catch (error) {
    if (!(error instanceof CompanionDatabaseBlockedError)) throw error;
    throw new Error(error.reason === 'newer-version' ? 'library_merge_source_newer' : 'library_merge_source_not_library', { cause: error });
  }
}

/**
 * Merges another library into the open one: a desktop library or `.db.gz` backup, or a phone backup as a zip or a
 * backup folder. The source is copied and brought to the current schema in a temporary file; the original is only read.
 */
export async function mergeDesktopLibrary(input: {
  sourcePath: string; attachmentsDirectory: string | null; folderTitle: string; now?: string; batchSize?: number;
}): Promise<DesktopLibraryMergeResult> {
  const now = input.now ?? new Date().toISOString();
  const connection = openDatabaseConnection();
  if (path.resolve(input.sourcePath) === path.resolve(connection.dbPath)) throw new Error('library_merge_source_is_current');
  const workDirectory = path.dirname(connection.dbPath);
  const mobile = await stageMobileLibrarySource(input.sourcePath, workDirectory, input.attachmentsDirectory);
  const artifacts = createDatabaseRestoreArtifacts();
  try {
    const fingerprint = await hashFile(mobile?.databasePath ?? input.sourcePath);
    const databasePath = await snapshotBackupRestoreSource(artifacts, mobile?.databasePath ?? input.sourcePath, workDirectory);
    await verifySqliteDatabaseFileOffMainThread(databasePath);
    const sqlite = new Database(databasePath, { fileMustExist: true });
    try {
      await migrateSource(sqlite, now);
      const host = desktopHost(fingerprint, input.folderTitle, now);
      const report = await runLibraryMerge({ source: createBetterSqliteDbPort(sqlite), now,
        target: ownedPort(createBetterSqliteDbPort(connection.sqlite)), host,
        ...(input.batchSize ? { batchSize: input.batchSize } : {}) });
      const attachments = await copyLibraryMergeAttachments(report.attachmentKeys, mobile ? mobile.attachmentsDirectory : input.attachmentsDirectory);
      return { added: report.added, alternatives: report.alternatives, unchanged: report.unchanged,
        skippedDeleted: report.skippedDeleted, reviewsAdded: report.reviewsAdded, attachmentsCopied: attachments.copied, attachmentsMissing: attachments.missing,
        folderId: host.folderId() };
    } finally { sqlite.close(); }
  } finally {
    await artifacts.finishTemporary();
    await mobile?.dispose();
  }
}
