import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseStoredAnchorLink, type StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { renderSingleArticleMirror } from './articleMirrorOutput.js';
export { resolveArticleIdFromNodeId, resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';

const INBOX_NODE_ID = 'special-inbox';

interface MirrorNodeRow {
  id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  content: string;
  reveal: string | null;
  anchor_link: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface AncestorRow {
  id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  deleted_at: string | null;
}

export function sanitizePathSegment(title: string) {
  const cleaned = Array.from(title)
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code <= 31 || '<>:"/\\|?*'.includes(character)) {
        return ' ';
      }
      return character;
    })
    .join('')
    .replace(/[.\s]+$/g, '')
    .trim();
  return cleaned || 'Untitled';
}

function resolveArticlePath(mirrorRoot: string, ancestors: AncestorRow[], articleTitle: string) {
  const folderSegments: string[] = [];
  let inTrash = false;

  for (const ancestor of ancestors) {
    if (ancestor.deleted_at) {
      inTrash = true;
    }
    if (ancestor.id === INBOX_NODE_ID) {
      folderSegments.push('Inbox');
    } else if (ancestor.kind === 'folder') {
      folderSegments.push(sanitizePathSegment(ancestor.title.trim() || 'Untitled'));
    }
  }

  if (inTrash) {
    return {
      targetPath: path.join(mirrorRoot, 'Trash', `${sanitizePathSegment(articleTitle)}.md`),
      relativePath: `Trash/${sanitizePathSegment(articleTitle)}.md`
    };
  }

  folderSegments.reverse();
  const directory = folderSegments.length > 0
    ? path.join(mirrorRoot, ...folderSegments)
    : mirrorRoot;

  const fileName = `${sanitizePathSegment(articleTitle)}.md`;
  const targetPath = path.join(directory, fileName);
  const relativePath = path.relative(mirrorRoot, targetPath).split(path.sep).join('/');

  return { targetPath, relativePath };
}

export function loadArticleNode(articleId: string): MirrorNodeRow | null {
  const db = openDatabaseConnection().sqlite;
  return db.prepare(
    'SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, content, reveal, anchor_link, created_at, updated_at, deleted_at FROM nodes WHERE id = ?'
  ).get(articleId) as MirrorNodeRow | null ?? null;
}

function loadArticleChildren(articleId: string): MirrorNodeRow[] {
  const db = openDatabaseConnection().sqlite;
  return db.prepare(
    'SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, content, reveal, anchor_link, created_at, updated_at, deleted_at FROM nodes WHERE parent_id = ?'
  ).all(articleId) as MirrorNodeRow[];
}

function loadAncestorChain(parentId: string): AncestorRow[] {
  const db = openDatabaseConnection().sqlite;
  return db.prepare(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, kind, title, deleted_at FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id, n.parent_id, n.kind, n.title, n.deleted_at
       FROM nodes n JOIN ancestors a ON n.id = a.parent_id
     )
     SELECT id, parent_id, kind, title, deleted_at FROM ancestors`
  ).all(parentId) as AncestorRow[];
}

interface ArticleNodeView {
  id: string;
  parentNodeId: string | null;
  kind: string;
  title: string;
  hideTitleHeading: boolean;
  content: string;
  reveal: string | null;
  anchorLink: StoredAnchorLink | null;
  updatedAt: string;
}

function toNodeView(row: MirrorNodeRow): ArticleNodeView {
  return {
    id: row.id,
    parentNodeId: row.parent_id,
    kind: row.kind,
    title: row.title,
    hideTitleHeading: row.hide_title_heading === 1,
    content: row.content,
    reveal: row.reveal,
    anchorLink: parseStoredAnchorLink(row.anchor_link),
    updatedAt: row.updated_at
  };
}

export function renderArticleMirrorMarkdown(articleRow: MirrorNodeRow) {
  const articleView = toNodeView(articleRow);
  const children = loadArticleChildren(articleRow.id);
  const childViews = children.map(toNodeView);
  const derivedChildren = childViews.filter((child) => child.anchorLink !== null);
  const manualTopics = childViews.filter((child) => child.kind === 'topic' && child.anchorLink === null);

  return renderSingleArticleMirror(articleView, derivedChildren, manualTopics);
}

function loadMirrorArticleRecord(articleId: string) {
  const db = openDatabaseConnection().sqlite;
  const row = db.prepare(
    'SELECT article_id, relative_path, mirrored_at FROM mirror_articles WHERE article_id = ?'
  ).get(articleId) as { article_id: string; relative_path: string; mirrored_at: string } | undefined;
  if (!row) {
    return null;
  }
  return { articleId: row.article_id, relativePath: row.relative_path, mirroredAt: row.mirrored_at };
}

function saveMirrorArticleRecord(articleId: string, relativePath: string, mirroredAt: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO mirror_articles (article_id, relative_path, mirrored_at)
       VALUES (?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET
         relative_path = excluded.relative_path,
         mirrored_at = excluded.mirrored_at`
    )
    .run(articleId, relativePath, mirroredAt);
}

async function removeMirrorFile(filePath: string) {
  await fs.rm(filePath, { force: true });
  const legacyDir = path.join(path.dirname(filePath), path.basename(filePath, '.md'));
  await fs.rm(legacyDir, { force: true, recursive: true });
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function removeEmptyMirrorParentDirectories(mirrorRoot: string, filePath: string) {
  const rootPath = path.resolve(mirrorRoot);
  let directoryPath = path.resolve(path.dirname(filePath));
  while (directoryPath !== rootPath && isInsideRoot(rootPath, directoryPath)) {
    try {
      await fs.rmdir(directoryPath);
    } catch {
      return;
    }
    directoryPath = path.dirname(directoryPath);
  }
}

async function removeMirrorFileAndEmptyParents(mirrorRoot: string, filePath: string) {
  await removeMirrorFile(filePath);
  await removeEmptyMirrorParentDirectories(mirrorRoot, filePath);
}

export async function exportArticleToMirror(articleId: string): Promise<boolean> {
  const articleRow = loadArticleNode(articleId);
  if (!articleRow) {
    return false;
  }

  if (articleRow.deleted_at) {
    const existingRecord = loadMirrorArticleRecord(articleId);
    if (existingRecord) {
      const paths = loadLibraryPathSettingsSync();
      const absolutePath = path.join(paths.mirror, ...existingRecord.relativePath.split('/'));
      await removeMirrorFileAndEmptyParents(paths.mirror, absolutePath);
      openDatabaseConnection().sqlite
        .prepare('DELETE FROM mirror_articles WHERE article_id = ?')
        .run(articleId);
    }
    return true;
  }

  const markdown = renderArticleMirrorMarkdown(articleRow);

  const paths = loadLibraryPathSettingsSync();
  const ancestors = articleRow.parent_id ? loadAncestorChain(articleRow.parent_id) : [];
  const articleTitle = articleRow.title.trim() || 'Untitled';
  const { targetPath, relativePath } = resolveArticlePath(paths.mirror, ancestors, articleTitle);

  const existingRecord = loadMirrorArticleRecord(articleId);
  if (existingRecord && existingRecord.relativePath !== relativePath) {
    const oldAbsolutePath = path.join(paths.mirror, ...existingRecord.relativePath.split('/'));
    await removeMirrorFileAndEmptyParents(paths.mirror, oldAbsolutePath);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, markdown, 'utf8');

  const mirroredAt = new Date().toISOString();
  saveMirrorArticleRecord(articleId, relativePath, mirroredAt);

  return true;
}
