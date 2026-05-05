import path from 'node:path';

import type { StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { renderArticleBodyFromLocators } from './articleMirrorAnchors.js';
import { stripLeadingMatchingHeading } from './articleMirrorMarkup.js';
import {
  compactNoteText,
  normalizeClozeComparableText,
  normalizeComparableText,
  preserveNoteLines,
  stripAnchorTags
} from './articleMirrorText.js';
import { collectArticleData } from './articleMirrorTree.js';
import { rewriteMirrorMarkdownAttachmentPaths } from './markdownAttachmentPaths.js';
import {
  createRootReservedDirectoryNames,
  resolveArticleDirectory
} from './mirrorTargetDirectories.js';
type ArticleNode = WorkspaceSnapshot['nodesById'][string];

export interface ArticleMirrorTarget {
  articleId: string;
  markdown: string;
  relativePath: string;
  sourceUpdatedAt: string;
  targetPath: string;
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

function formatMirrorFileTimestampParts(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return {
      date: 'unknown',
      minute: 'unknown0000',
      second: 'unknown000000'
    };
  }
  const normalized = new Date(parsed).toISOString();
  return {
    date: normalized.slice(2, 10).replaceAll('-', ''),
    minute: normalized.slice(2, 16).replaceAll('-', '').replace('T', '').replace(':', ''),
    second: normalized.slice(2, 19).replaceAll('-', '').replace('T', '').replaceAll(':', '')
  };
}

function createStableFileName(title: string, createdAt: string, usedNames: Set<string>) {
  const baseName = sanitizeArticleTitle(title);
  const firstCandidate = `${baseName}.md`;
  if (!usedNames.has(firstCandidate)) {
    usedNames.add(firstCandidate);
    return firstCandidate;
  }
  const timestampParts = formatMirrorFileTimestampParts(createdAt);
  const secondCandidate = `${baseName}${timestampParts.second}.md`;
  if (!usedNames.has(secondCandidate)) {
    usedNames.add(secondCandidate);
    return secondCandidate;
  }

  let duplicateIndex = 2;
  while (true) {
    const dedupedCandidate = `${baseName}${timestampParts.second}${duplicateIndex}.md`;
    if (!usedNames.has(dedupedCandidate)) {
      usedNames.add(dedupedCandidate);
      return dedupedCandidate;
    }
    duplicateIndex += 1;
  }
}

function createStableDirectoryName(title: string, nodeId: string, usedNames: Set<string>) {
  const baseName = sanitizeArticleTitle(title);
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  const suffix = nodeId.replace(/^node-/, '').slice(0, 8) || nodeId.slice(-8);
  const dedupedCandidate = `${baseName}--${suffix}`;
  usedNames.add(dedupedCandidate);
  return dedupedCandidate;
}

function createBaselineClozePrompt(articleContent: string, articleTitle: string, from: number, to: number) {
  return compactNoteText(stripLeadingMatchingHeading(`${articleContent.slice(0, from)}[...]${articleContent.slice(to)}`, articleTitle));
}

function formatSnowflake(parts: string[]) {
  return ` (❄ ${parts.join('; ')})`;
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
        const note = preserveNoteLines(child.content);
        if (normalizeComparableText(note) === normalizeComparableText(sourceText)) {
          return null;
        }
        return `highlight: ${note || 'updated highlight'}`;
      }

      const parts: string[] = [];
      const baselinePrompt = createBaselineClozePrompt(article.content, article.title.trim() || 'Untitled', from, to);
      const prompt = preserveNoteLines(stripLeadingMatchingHeading(stripAnchorTags(child.content), article.title.trim() || 'Untitled'));
      if (normalizeClozeComparableText(prompt) !== normalizeClozeComparableText(baselinePrompt)) {
        parts.push(`cloze: ${prompt || 'updated cloze'}`);
      }
      const answer = preserveNoteLines(child.reveal) || preserveNoteLines(sourceText) || 'updated answer';
      if (normalizeComparableText(answer) !== normalizeComparableText(sourceText)) {
        parts.push(`answer: ${answer}`);
      }
      return parts.length > 0 ? parts.join('; ') : null;
    })
    .filter((value, index, collection): value is string => Boolean(value) && collection.indexOf(value) === index);

  return notes.length > 0 ? ` (❄ ${notes.join(' | ')})` : '';
}

function renderArticleBody(article: ArticleNode, derivedByAnchorKey: Map<string, ArticleNode[]>) {
  const articleTitle = article.title.trim() || 'Untitled';
  const rendered = renderArticleBodyFromLocators({
    articleContent: article.content,
    createExtraNote: (span) =>
      createExtraNote(article, span.kind, span.sourceText, span.anchorId, span.from, span.to, derivedByAnchorKey),
    derivedByAnchorKey
  });
  return stripLeadingMatchingHeading(rendered, articleTitle);
}

function renderManualTopicAppendix(manualTopics: ArticleNode[]) {
  if (manualTopics.length === 0) {
    return '';
  }
  const appendix = manualTopics
    .map((topic) => {
      const parts = [`keyword: ${compactNoteText(topic.title) || 'Untitled'}`];
      const note = preserveNoteLines(topic.content);
      if (note) {
        parts.push(`note: ${note}`);
      }
      return formatSnowflake(parts);
    })
    .join('\n');
  return `\n\n${appendix}`;
}

function renderArticleMarkdown(article: ArticleNode, derivedByAnchorKey: Map<string, ArticleNode[]>, manualTopics: ArticleNode[]) {
  const title = article.title.trim() || 'Untitled';
  const body = `${renderArticleBody(article, derivedByAnchorKey).trim()}${renderManualTopicAppendix(manualTopics)}`.trim();
  if (body.length === 0) {
    return rewriteMirrorMarkdownAttachmentPaths(`# ${title}\n`);
  }
  if (article.hideTitleHeading) {
    return rewriteMirrorMarkdownAttachmentPaths(`${body}\n`);
  }
  return rewriteMirrorMarkdownAttachmentPaths(`# ${title}\n\n${body}\n`);
}

function buildDerivedChildMap(snapshot: WorkspaceSnapshot, articleId: string) {
  const derivedChildren = Object.values(snapshot.nodesById).filter(
    (node) => node.parentNodeId === articleId && node.anchorLink !== null
  );
  const map = new Map<string, ArticleNode[]>();
  for (const node of derivedChildren) {
    const key = `${node.anchorLink?.kind}:${node.anchorLink?.id}`;
    map.set(key, [...(map.get(key) ?? []), node]);
  }
  return { derivedByAnchorKey: map, derivedChildren };
}
function toRelativeMirrorPath(mirrorRoot: string, targetPath: string) {
  return path.relative(mirrorRoot, targetPath).split(path.sep).join('/');
}

function resolveSourceUpdatedAt(article: ArticleNode, derivedChildren: ArticleNode[]) {
  return derivedChildren.reduce(
    (latest, child) => (child.updatedAt > latest ? child.updatedAt : latest),
    article.updatedAt
  );
}

export interface MirrorRenderableNode {
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

export function renderSingleArticleMirror(
  article: MirrorRenderableNode,
  derivedChildren: MirrorRenderableNode[],
  manualTopics: MirrorRenderableNode[]
): string {
  const map = new Map<string, ArticleNode[]>();
  for (const node of derivedChildren) {
    const key = `${node.anchorLink?.kind}:${node.anchorLink?.id}`;
    map.set(key, [...(map.get(key) ?? []), node as ArticleNode]);
  }
  return renderArticleMarkdown(article as ArticleNode, map, manualTopics as ArticleNode[]);
}

export function collectArticleMirrorTargets(snapshot: WorkspaceSnapshot, mirrorRoot: string): ArticleMirrorTarget[] {
  const { articles, manualTopicsByArticleId } = collectArticleData(snapshot);
  const usedFileNamesByDirectory = new Map<string, Set<string>>();
  const usedDirectoryNamesByParent = createRootReservedDirectoryNames(mirrorRoot);
  const resolvedFolderDirectories = new Map<string, string>();

  return articles.map((article) => {
    const targetDirectory = resolveArticleDirectory(
      article,
      snapshot,
      mirrorRoot,
      resolvedFolderDirectories,
      usedDirectoryNamesByParent,
      createStableDirectoryName
    );
    const usedNames = usedFileNamesByDirectory.get(targetDirectory) ?? new Set<string>();
    usedFileNamesByDirectory.set(targetDirectory, usedNames);
    const fileName = createStableFileName(article.title.trim() || 'Untitled', article.createdAt, usedNames);
    const targetPath = path.join(targetDirectory, fileName);
    const { derivedByAnchorKey, derivedChildren } = buildDerivedChildMap(snapshot, article.id);
    const manualTopics = manualTopicsByArticleId.get(article.id) ?? [];
    return {
      articleId: article.id,
      markdown: renderArticleMarkdown(article, derivedByAnchorKey, manualTopics),
      relativePath: toRelativeMirrorPath(mirrorRoot, targetPath),
      sourceUpdatedAt: resolveSourceUpdatedAt(article, [...derivedChildren, ...manualTopics]),
      targetPath
    };
  });
}
