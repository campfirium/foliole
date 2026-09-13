import { promises as fs } from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';

export interface MirrorArticleRecord {
  articleId: string;
  mirroredAt: string;
  relativePath: string;
}

export function loadMirrorArticleRecords() {
  const rows = openDatabaseConnection().sqlite
    .prepare('SELECT article_id, relative_path, mirrored_at FROM mirror_articles')
    .all() as Array<{ article_id: string; mirrored_at: string; relative_path: string }>;
  return new Map(rows.map((row) => [row.article_id, {
    articleId: row.article_id,
    mirroredAt: row.mirrored_at,
    relativePath: row.relative_path
  } satisfies MirrorArticleRecord]));
}

export function saveMirrorArticleRecord(record: MirrorArticleRecord) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO mirror_articles (article_id, relative_path, mirrored_at)
       VALUES (?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET
         relative_path = excluded.relative_path,
         mirrored_at = excluded.mirrored_at`
    )
    .run(record.articleId, record.relativePath, record.mirroredAt);
}

export function deleteMirrorArticleRecord(articleId: string) {
  openDatabaseConnection().sqlite.prepare('DELETE FROM mirror_articles WHERE article_id = ?').run(articleId);
}

export function clearMirrorArticleRecords() {
  openDatabaseConnection().sqlite.prepare('DELETE FROM mirror_articles').run();
}

export function resolveAbsoluteMirrorPath(mirrorRoot: string, relativePath: string) {
  return path.join(mirrorRoot, ...relativePath.split('/'));
}

function resolveLegacyArticleDirectory(filePath: string) {
  return path.join(path.dirname(filePath), path.basename(filePath, '.md'));
}

export async function readMirrorFileUpdatedAt(filePath: string) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats.mtime.toISOString() : null;
  } catch {
    return null;
  }
}

export async function removeMirrorFileAndLegacyDirectory(filePath: string) {
  await fs.rm(filePath, { force: true });
  await fs.rm(resolveLegacyArticleDirectory(filePath), { force: true, recursive: true });
}

export async function removeLegacyMirrorArtifacts(mirrorRoot: string, targetPaths: string[]) {
  await Promise.all([
    fs.rm(path.join(mirrorRoot, 'Highlights.md'), { force: true }),
    fs.rm(path.join(mirrorRoot, 'Clozes.md'), { force: true })
  ]);
  await Promise.all(targetPaths.map((targetPath) =>
    fs.rm(resolveLegacyArticleDirectory(targetPath), { force: true, recursive: true })
  ));
}

export async function resetMirrorRoot(mirrorRoot: string) {
  await fs.mkdir(mirrorRoot, { recursive: true });
  const entries = await fs.readdir(mirrorRoot);
  await Promise.all(entries.map((entry) =>
    fs.rm(path.join(mirrorRoot, entry), { recursive: true, force: true })
  ));
}
