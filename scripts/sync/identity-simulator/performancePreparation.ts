import { constants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import Database from 'better-sqlite3';

import { createSyncIdentitySourceView } from '../../../electron/database/syncIdentitySourceView.js';
import { createSyncPackSourceView } from '../../../electron/database/syncPackSourceView.js';

async function fileBytes(file: string) {
  try { return (await fs.stat(file)).size; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function measureView(base: string, output: string, kind: 'old' | 'identity') {
  const root = path.join(output, kind);
  await fs.mkdir(root, { recursive: true });
  const sourcePath = path.join(root, 'source.db');
  const viewPath = path.join(root, 'view.db');
  await fs.copyFile(path.join(base, 'foliole.db'), sourcePath, constants.COPYFILE_FICLONE);
  const source = new Database(sourcePath);
  try {
    const started = performance.now();
    const view = kind === 'old'
      ? await createSyncPackSourceView(source, viewPath)
      : await createSyncIdentitySourceView(source, viewPath);
    view.close();
    const durationMs = performance.now() - started;
    const sourceBytes = await fileBytes(sourcePath);
    const sourceWalBytes = await fileBytes(`${sourcePath}-wal`);
    const viewBytes = await fileBytes(viewPath);
    const viewWalBytes = await fileBytes(`${viewPath}-wal`);
    return { kind, durationMs, sourceBytes, sourceWalBytes, viewBytes, viewWalBytes,
      publishedViewBytes: viewBytes + viewWalBytes };
  } finally { source.close(); }
}

/** Published file sizes are disk footprint, not a claim of physical read/write bytes. */
export function measureVersionPayload(database: string) {
  const sqlite = new Database(database, { readonly: true, fileMustExist: true });
  try {
    return [300, 1000, 10000].map((count) => {
      const selectedTopics = sqlite.prepare(`SELECT COUNT(*) AS count FROM
        (SELECT id FROM nodes WHERE kind = 'topic'
          AND id NOT IN ('special-inbox', 'special-virtual-root')
          AND deleted_at IS NULL AND current_version_id IS NOT NULL
          ORDER BY id LIMIT ?)`).get(count) as { count: number };
      const row = sqlite.prepare(`SELECT COUNT(*) AS rows,
        COALESCE(SUM(length(CAST(snapshot_json AS BLOB)) +
          COALESCE(length(CAST(body_text AS BLOB)), 0)), 0) AS logicalBytes
        FROM node_sync_versions WHERE object_id IN
          (SELECT id FROM nodes WHERE kind = 'topic'
            AND id NOT IN ('special-inbox', 'special-virtual-root')
            AND deleted_at IS NULL AND current_version_id IS NOT NULL ORDER BY id LIMIT ?)`)
        .get(count) as { rows: number; logicalBytes: number };
      return { requestedTopics: count, selectedTopics: selectedTopics.count, ...row };
    });
  } finally { sqlite.close(); }
}

export async function measureIdentitySourceViewPreparation(base: string, output: string,
  editedDatabase?: string) {
  const views = [];
  for (const kind of ['old', 'identity'] as const) {
    views.push(await measureView(base, output, kind));
  }
  const report = { base, views,
    versionPayload: editedDatabase ? measureVersionPayload(editedDatabase) : undefined,
    measurement: 'view elapsed time and published file bytes; version logical bytes; physical I/O unavailable' };
  await fs.writeFile(path.join(output, 'preparation.json'), JSON.stringify(report, null, 2));
  return report;
}
