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
import { hasArticleBodyTitleHeading } from './articleMirrorTitle.js';

type ArticleNode = WorkspaceSnapshot['nodesById'][string];

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
  return renderArticleBodyFromLocators({
    articleContent: article.content,
    createExtraNote: (span) =>
      createExtraNote(article, span.kind, span.sourceText, span.anchorId, span.from, span.to, derivedByAnchorKey),
    derivedByAnchorKey
  });
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
    return `# ${title}\n`;
  }
  if (hasArticleBodyTitleHeading(body)) {
    return `${body}\n`;
  }
  return `# ${title}\n\n${body}\n`;
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

export function renderSingleArticleMirrorRaw(
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
