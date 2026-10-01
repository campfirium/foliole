import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { initializeDatabaseSchema } from '../../../lib/core/database/migrations.js';
import type { ArticleAttachmentNeed } from '../../../lib/core/sync/articleAttachmentNeeds.js';
import { loadNodeOwnedArticleResourceNeeds } from '../../../lib/core/sync/nodeOwnedArticleResourceNeeds.js';
import { classifyAttachmentBytes } from '../../../lib/platform/attachmentByteClassification.js';

export async function snapshotInput(database: string, assets: string | undefined, destination: string, deferResources = false) {
  await fs.mkdir(path.join(destination, 'assets'), { recursive: true });
  const source = new Database(database, { readonly: true, fileMustExist: true });
  const output = path.join(destination, 'foliole.db');
  let sourceSchemaVersion: unknown;
  try {
    sourceSchemaVersion = source.pragma('user_version', { simple: true });
    await source.backup(output);
  } finally { source.close(); }
  const copy = new Database(output);
  try {
    initializeDatabaseSchema(copy);
    const ids = copy.prepare('SELECT id FROM nodes WHERE deleted_at IS NULL').pluck().all() as string[];
    const resources = await loadNodeOwnedArticleResourceNeeds(createBetterSqliteDbPort(copy), ids);
    const input = { database: path.resolve(database), assets, output, destination,
      resourceNeeds: resources.needs, unreadableArticleIds: resources.unreadableArticleIds,
      resourceIssues: [] as ResourceIssue[], sourceSchemaVersion,
      schemaVersion: copy.pragma('user_version', { simple: true }),
      counts: { nodes: copy.prepare('SELECT count(*) FROM nodes').pluck().get(),
        versions: copy.prepare('SELECT count(*) FROM node_sync_versions').pluck().get(), resources: resources.needs.length } };
    if (!deferResources) await copyInputResources(input, resources.needs);
    return input;
  } finally { copy.close(); }
}
interface ResourceIssue { key: string; error: string; }
export async function copyInputResources(input: {
  assets: string | undefined; destination: string; resourceIssues: ResourceIssue[];
}, needs: readonly ArticleAttachmentNeed[]) {
  for (const need of needs) {
    try {
      if (!input.assets) throw new Error('input_resource_directory_missing');
      const bytes = await fs.readFile(path.join(input.assets, need.storageKey));
      if (createHash('sha256').update(bytes).digest('hex') !== need.contentHash) throw new Error('input_resource_hash_mismatch');
      await fs.writeFile(path.join(input.destination, 'assets', need.storageKey), bytes, { flag: 'wx' });
      if (classifyAttachmentBytes(bytes.subarray(0, 128)) !== need.mimeType) throw new Error('input_resource_type_mismatch');
    } catch (error) { input.resourceIssues.push({ key: need.storageKey, error: String(error) }); }
  }
}
