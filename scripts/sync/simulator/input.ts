import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { buildCanonicalAttachmentStorageKey } from '../../../lib/platform/attachmentResource.js';

export async function snapshotInput(database: string, assets: string | undefined, destination: string) {
  await fs.mkdir(path.join(destination, 'assets'), { recursive: true });
  const source = new Database(database, { readonly: true, fileMustExist: true });
  const output = path.join(destination, 'foliole.db');
  try { await source.backup(output); } finally { source.close(); }
  const copy = new Database(output, { readonly: true });
  const issues: Array<Record<string, unknown>> = [];
  try {
    const rows = copy.prepare('SELECT id,mime_type FROM attachments').all() as { id: string; mime_type: string }[];
    for (const row of rows) {
      const key = buildCanonicalAttachmentStorageKey(row.id, row.mime_type);
      if (!key || !assets) {
        issues.push({ attachment: row.id, error: 'input_attachment_path_missing' });
        continue;
      }
      try {
        const bytes = await fs.readFile(path.join(assets, key));
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (hash !== row.id) throw new Error('input_attachment_hash_mismatch');
        await fs.writeFile(path.join(destination, 'assets', key), bytes, { flag: 'wx' });
      } catch (error) {
        issues.push({ attachment: row.id, key, error: String(error) });
      }
    }
    return { database: path.resolve(database), assets, output, resourceIssues: issues,
      schemaVersion: copy.pragma('user_version', { simple: true }),
      counts: { nodes: copy.prepare('SELECT count(*) FROM nodes').pluck().get(),
        versions: copy.prepare('SELECT count(*) FROM node_sync_versions').pluck().get(), attachments: rows.length } };
  } finally { copy.close(); }
}
