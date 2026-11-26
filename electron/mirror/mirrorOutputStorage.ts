import { promises as fs } from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';

import { mirrorPathKey } from './mirrorPathIdentity.js';

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

// Hidden entries belong to other tools (such as .obsidian) and survive cleanup.
// Foliole's own temporary files and Finder metadata do not count as user content.
function isKeptHiddenEntry(name: string) {
  return name.startsWith('.') && name !== '.DS_Store' && !/^\.foliole-mirror-[0-9a-f-]{36}\.tmp$/.test(name);
}

async function removeMirrorTree(targetPath: string) {
  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!stats.isDirectory()) {
    await fs.rm(targetPath, { force: true });
    return;
  }
  const entries = await fs.readdir(targetPath);
  await Promise.all(entries.filter((entry) => !isKeptHiddenEntry(entry))
    .map((entry) => removeMirrorTree(path.join(targetPath, entry))));
  try {
    await fs.rmdir(targetPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'ENOENT') throw error;
  }
}

async function removeUnprotectedMirrorPath(targetPath: string, protectedPaths: Set<string>, recursive = false) {
  if (!protectedPaths.has(mirrorPathKey(path.resolve(targetPath)))) {
    try {
      await (recursive ? removeMirrorTree(targetPath) : fs.rm(targetPath, { force: true }));
    } catch (error) {
      // A file awaiting relocation can still occupy an ancestor of this absent legacy path.
      if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
    }
  }
}

export async function removeMirrorFileAndLegacyDirectory(filePath: string, protectedPaths = new Set<string>()) {
  await removeUnprotectedMirrorPath(filePath, protectedPaths);
  await removeLegacyMirrorArticleDirectory(filePath, protectedPaths);
}

export async function removeLegacyMirrorArticleDirectory(filePath: string, protectedPaths = new Set<string>()) {
  await removeUnprotectedMirrorPath(resolveLegacyArticleDirectory(filePath), protectedPaths, true);
}

export async function resetMirrorRoot(mirrorRoot: string) {
  await fs.mkdir(mirrorRoot, { recursive: true });
  const entries = await fs.readdir(mirrorRoot);
  await Promise.all(entries.filter((entry) => !isKeptHiddenEntry(entry))
    .map((entry) => removeMirrorTree(path.join(mirrorRoot, entry))));
}
