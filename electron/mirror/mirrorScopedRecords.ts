import { openDatabaseConnection } from '../database/connection.js';

import type { MirrorArticleRecord } from './mirrorOutputStorage.js';
import { mirrorPathKey } from './mirrorPathIdentity.js';

// ASCII characters that only ASCII spellings (in either case) can produce in a mirror path key. Others, including
// `i` and `k` (from U+0130 and U+212A), become wildcards so the SQL filter stays a superset of the exact match.
const STABLE_KEY_CHARACTER = /^[a-hjl-z0-9/. -]$/;

/** A LIKE pattern matched by every stored spelling whose mirror path key equals `key`. */
export function mirrorKeyLikePattern(key: string) {
  let pattern = '';
  for (const character of key) {
    const next = STABLE_KEY_CHARACTER.test(character) ? character : '%';
    if (next !== '%' || !pattern.endsWith('%')) pattern += next;
  }
  return pattern;
}

interface RecordRow {
  article_id: string;
  mirrored_at: string;
  relative_path: string;
}

function queryRecords(where: string, params: unknown[]) {
  return openDatabaseConnection().driver.queryAll<RecordRow & Record<string, unknown>>(
    `SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE ${where}`, params as never
  ).map((row): MirrorArticleRecord => ({ articleId: row.article_id, mirroredAt: row.mirrored_at, relativePath: row.relative_path }));
}

function directoryOf(relativePath: string) {
  const index = relativePath.lastIndexOf('/');
  return index < 0 ? '' : relativePath.slice(0, index);
}

function pathAndAncestorKeys(relativePath: string) {
  const keys = [mirrorPathKey(relativePath)];
  for (let directory = directoryOf(relativePath); directory; directory = directoryOf(directory)) {
    keys.push(mirrorPathKey(directory));
  }
  return keys;
}

export function loadMirrorRecordsByArticleIds(articleIds: string[]) {
  return queryRecords('article_id IN (SELECT value FROM json_each(?))', [JSON.stringify(articleIds)]);
}

/** Records whose file sits directly in the directory `relativeDirectory` ('' is the mirror root). */
export function loadMirrorRecordsInDirectory(relativeDirectory: string) {
  const directoryKey = mirrorPathKey(relativeDirectory);
  const depth = relativeDirectory ? directoryKey.split('/').length : 0;
  const pattern = relativeDirectory ? `${mirrorKeyLikePattern(directoryKey)}/%` : '%';
  return queryRecords(`length(relative_path) - length(replace(relative_path, '/', '')) = ? AND relative_path LIKE ?`,
    [depth, pattern]).filter((record) => mirrorPathKey(directoryOf(record.relativePath)) === directoryKey);
}

/** Records stored at any of `keys` or anywhere below them. */
export function loadMirrorRecordsAtOrUnder(keys: string[]) {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return [];
  const patterns = unique.flatMap((key) => [mirrorKeyLikePattern(key), `${mirrorKeyLikePattern(key)}/%`]);
  const wanted = new Set(unique);
  return queryRecords(patterns.map(() => 'relative_path LIKE ?').join(' OR '), patterns)
    .filter((record) => pathAndAncestorKeys(record.relativePath).some((key) => wanted.has(key)));
}
