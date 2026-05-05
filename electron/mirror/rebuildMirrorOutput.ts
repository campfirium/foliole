import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeMirrorOutputRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

const INBOX_NODE_ID = 'special-inbox';
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;
const INLINE_ANCHOR_PATTERN = /<(highlight|cloze)\s+id="([^"]+)">([\s\S]*?)<\/\1 id="\2">/g;
type Snapshot = NonNullable<ReturnType<typeof loadWorkspaceSnapshot>>;
type ArticleNode = Snapshot['nodesById'][string];

function stripAnchorTags(value: string) {
  return value.replace(ANCHOR_TAG_PATTERN, '');
}

function normalizeComparableText(value: string | null | undefined) {
  return stripAnchorTags(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactNoteText(value: string | null | undefined) {
  return stripAnchorTags(value ?? '')
    .replace(/\r\n?/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitizeArticleTitle(title: string) {
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

function createStableFileName(title: string, nodeId: string, usedNames: Set<string>) {
  const baseName = sanitizeArticleTitle(title);
  const firstCandidate = `${baseName}.md`;
  if (!usedNames.has(firstCandidate)) {
    usedNames.add(firstCandidate);
    return firstCandidate;
  }
  const suffix = nodeId.replace(/^node-/, '').slice(0, 8) || nodeId.slice(-8);
  const dedupedCandidate = `${baseName}--${suffix}.md`;
  usedNames.add(dedupedCandidate);
  return dedupedCandidate;
}

function resolveArticleDirectory(node: ArticleNode, snapshot: Snapshot, mirrorRoot: string) {
  if (snapshot.trashedNodeIds.includes(node.id)) {
    return path.join(mirrorRoot, 'Trash');
  }
  if (node.parentNodeId === INBOX_NODE_ID) {
    return path.join(mirrorRoot, 'Inbox');
  }
  return mirrorRoot;
}

function createBaselineClozePrompt(articleContent: string, from: number, to: number) {
  return compactNoteText(`${articleContent.slice(0, from)}[...]${articleContent.slice(to)}`);
}

function createExtraNote(
  article: ArticleNode,
  kind: 'highlight' | 'cloze',
  sourceText: string,
  anchorId: string,
  from: number,
  to: number,
  derivedByAnchorKey: Map<string, ArticleNode[]>
) {
  const linkedChildren = derivedByAnchorKey.get(`${kind}:${anchorId}`) ?? [];
  if (linkedChildren.length === 0) {
    return '';
  }

  const notes = linkedChildren
    .map((child) => {
      if (kind === 'highlight') {
        if (normalizeComparableText(child.content) === normalizeComparableText(sourceText)) {
          return null;
        }
        return compactNoteText(child.content) || 'updated highlight';
      }

      const parts: string[] = [];
      const baselinePrompt = createBaselineClozePrompt(article.content, from, to);
      if (normalizeComparableText(child.content) !== normalizeComparableText(baselinePrompt)) {
        parts.push(`prompt: ${compactNoteText(child.content) || 'updated prompt'}`);
      }
      if (normalizeComparableText(child.reveal) !== normalizeComparableText(sourceText)) {
        parts.push(`answer: ${compactNoteText(child.reveal) || 'updated answer'}`);
      }
      return parts.length > 0 ? parts.join('; ') : null;
    })
    .filter((value, index, collection): value is string => Boolean(value) && collection.indexOf(value) === index);

  return notes.length > 0 ? ` (❄ ${notes.join(' | ')})` : '';
}

function renderArticleBody(article: ArticleNode, derivedByAnchorKey: Map<string, ArticleNode[]>) {
  return article.content
    .replace(INLINE_ANCHOR_PATTERN, (match, rawKind, anchorId, sourceText, offset) => {
      const kind = rawKind as 'highlight' | 'cloze';
      const markedSource = kind === 'highlight' ? `==${sourceText}==` : `_${sourceText}_`;
      return markedSource + createExtraNote(article, kind, sourceText, anchorId, offset, offset + match.length, derivedByAnchorKey);
    })
    .replace(ANCHOR_TAG_PATTERN, '');
}

function renderArticleMarkdown(article: ArticleNode, derivedByAnchorKey: Map<string, ArticleNode[]>) {
  const title = article.title.trim() || 'Untitled';
  const body = renderArticleBody(article, derivedByAnchorKey).trim();
  if (body.length === 0) {
    return `# ${title}\n`;
  }
  if (article.hideTitleHeading) {
    return `${body}\n`;
  }
  return `# ${title}\n\n${body}\n`;
}

function buildDerivedChildMap(snapshot: Snapshot, articleId: string) {
  const derivedChildren = Object.values(snapshot.nodesById).filter(
    (node) => node.parentNodeId === articleId && node.anchorLink !== null
  );
  const map = new Map<string, ArticleNode[]>();
  for (const node of derivedChildren) {
    const key = `${node.anchorLink?.kind}:${node.anchorLink?.id}`;
    map.set(key, [...(map.get(key) ?? []), node]);
  }
  return map;
}

function collectArticleNodes(snapshot: Snapshot) {
  const orderedIds = new Map(snapshot.nodeOrder.map((nodeId, index) => [nodeId, index]));
  return Object.values(snapshot.nodesById)
    .filter((node) => node.id !== INBOX_NODE_ID && node.anchorLink === null)
    .sort((left, right) => (orderedIds.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderedIds.get(right.id) ?? Number.MAX_SAFE_INTEGER));
}

export async function rebuildMirrorOutput(): Promise<NativeMirrorOutputRebuildResult> {
  const updatedAt = new Date().toISOString();
  const snapshot = loadWorkspaceSnapshot();
  if (!snapshot) {
    return {
      queued_article_count: 0,
      rebuilt_article_count: 0,
      failed_article_count: 0,
      pending_article_count: 0,
      updated_at: updatedAt
    };
  }

  const paths = loadLibraryPathSettingsSync();
  const articles = collectArticleNodes(snapshot);
  const usedFileNamesByDirectory = new Map<string, Set<string>>();
  let rebuiltArticleCount = 0;
  let failedArticleCount = 0;

  for (const article of articles) {
    const targetDirectory = resolveArticleDirectory(article, snapshot, paths.mirror);
    const usedNames = usedFileNamesByDirectory.get(targetDirectory) ?? new Set<string>();
    usedFileNamesByDirectory.set(targetDirectory, usedNames);
    const fileName = createStableFileName(article.title.trim() || 'Untitled', article.id, usedNames);

    try {
      await fs.mkdir(targetDirectory, { recursive: true });
      await fs.writeFile(
        path.join(targetDirectory, fileName),
        renderArticleMarkdown(article, buildDerivedChildMap(snapshot, article.id)),
        'utf8'
      );
      rebuiltArticleCount += 1;
    } catch {
      failedArticleCount += 1;
    }
  }

  return {
    queued_article_count: articles.length,
    rebuilt_article_count: rebuiltArticleCount,
    failed_article_count: failedArticleCount,
    pending_article_count: failedArticleCount,
    updated_at: updatedAt
  };
}
