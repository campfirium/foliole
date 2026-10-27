import { getPdfAnchorLocators } from '../../lib/core/anchors/pdfAnchorLocator.js';
import type { StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
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
  derivedByAnchorKey: Map<string, ArticleNode[]>,
  renderChild: (child: ArticleNode) => string,
  located: boolean
) {
  const linkedChildren = derivedByAnchorKey.get(`${kind}:${anchorId}`) ?? [];
  if (linkedChildren.length === 0) {
    return '';
  }

  const notes = linkedChildren
    .map((child) => {
      if (kind === 'highlight') {
        const note = preserveNoteLines(renderChild(child));
        if (normalizeComparableText(note) === normalizeComparableText(sourceText)) {
          return null;
        }
        return `highlight: ${note || 'updated highlight'}`;
      }

      const parts: string[] = [];
      const baselinePrompt = createBaselineClozePrompt(article.content, article.title.trim() || 'Untitled', from, to);
      const prompt = preserveNoteLines(stripLeadingMatchingHeading(stripAnchorTags(renderChild(child)), article.title.trim() || 'Untitled'));
      if (!located || normalizeClozeComparableText(prompt) !== normalizeClozeComparableText(baselinePrompt)) {
        parts.push(`cloze: ${prompt || 'updated cloze'}`);
      }
      const answer = preserveNoteLines(child.reveal) || preserveNoteLines(sourceText) || 'updated answer';
      if (!located || normalizeComparableText(answer) !== normalizeComparableText(sourceText)) {
        parts.push(`answer: ${answer}`);
      }
      if (!located && sourceText && normalizeComparableText(answer) !== normalizeComparableText(sourceText)) {
        parts.push(`source: ${preserveNoteLines(sourceText)}`);
      }
      return parts.length > 0 ? parts.join('; ') : null;
    })
    .filter((value, index, collection): value is string => Boolean(value) && collection.indexOf(value) === index);

  return notes.length > 0 ? ` (❄ ${notes.join(' | ')})` : '';
}

function renderImageExcerpt(article: ArticleNode, children: ArticleNode[], derivedChildren: MirrorRenderableNode[], pages: number[]) {
  const locator = children[0]?.anchorLink?.locator;
  const source = locator && 'originalText' in locator ? locator.originalText : '';
  const parts = children.map((child) => preserveNoteLines(renderArticleBody(child, derivedChildren))).filter(Boolean);
  if (source && !article.content.includes(source)) parts.push(`source: ${source}`);
  const page = pages.length > 0 ? `PDF page: ${pages.join(', ')}; ` : '';
  return `(❄ ${page}image excerpt: ${parts.join(' | ')})`;
}

function renderArticleBody(article: ArticleNode, derivedChildren: MirrorRenderableNode[]): string {
  const derivedByAnchorKey = collectAnchorChildren(article.id, derivedChildren);
  const renderedKeys = new Set<string>();
  const createNote = (kind: 'highlight' | 'cloze', anchorId: string, sourceText: string, from: number, to: number, located = true) => {
    renderedKeys.add(`${kind}:${anchorId}`);
    return createExtraNote(article, kind, sourceText, anchorId, from, to, derivedByAnchorKey,
      (child) => renderArticleBody(child, derivedChildren), located);
  };
  const body = renderArticleBodyFromLocators({
    articleContent: article.content,
    createExtraNote: (span) => createNote(span.kind, span.anchorId, span.sourceText, span.from, span.to),
    derivedByAnchorKey
  });
  const unlocated = [...derivedByAnchorKey.entries()].flatMap(([key, children]) => {
    const anchor = children[0]?.anchorLink;
    if (!anchor || renderedKeys.has(key)) return [];
    const locator = anchor.locator;
    const pages = getPdfAnchorLocators(locator).map((fragment) => fragment.page);
    if (anchor.kind === 'image-excerpt') return renderImageExcerpt(article, children, derivedChildren, pages);
    if (anchor.kind !== 'highlight' && anchor.kind !== 'cloze') return [];
    if (pages.length > 0) {
      return `(❄ PDF ${pages.length === 1 ? 'page' : 'pages'}: ${pages.join(', ')})` +
        createNote(anchor.kind, anchor.id, '', 0, 0, false);
    }
    if (anchor.kind === 'cloze' && locator && !('ranges' in locator) &&
      (!('from' in locator && 'to' in locator) || 'x' in locator)) {
      return 'attachmentId' in locator && 'x' in locator
        ? createNote('cloze', anchor.id, '', 0, 0, false) : [];
    }
    const ranges = locator && 'ranges' in locator ? locator.ranges : locator ? [locator] : [];
    const source = ranges.map((range) => 'originalText' in range ? range.originalText : '').filter(Boolean).join('\n');
    return createNote(anchor.kind, anchor.id, anchor.kind === 'cloze' ? source : '', 0, 0, false);
  });
  const sources = (article.resourceReferences ?? [])
    .filter((resource) => resource.role === 'reference' && resource.storage_key.endsWith('.pdf'))
    .map((resource) => `[PDF source](<${buildAssetMarkdownUrl(resource.storage_key)}>)`);
  return [body, ...sources, ...unlocated].filter(Boolean).join('\n\n');
}

function renderManualTopicAppendix(manualTopics: ArticleNode[], derivedChildren: MirrorRenderableNode[]) {
  if (manualTopics.length === 0) {
    return '';
  }
  const appendix = manualTopics
    .map((topic) => {
      const parts = [`keyword: ${compactNoteText(topic.title) || 'Untitled'}`];
      const note = preserveNoteLines(renderArticleBody(topic, derivedChildren));
      if (note) {
        parts.push(`note: ${note}`);
      }
      return formatSnowflake(parts);
    })
    .join('\n');
  return `\n\n${appendix}`;
}

function renderArticleMarkdown(article: ArticleNode, derivedChildren: MirrorRenderableNode[], manualTopics: ArticleNode[]) {
  const title = article.title.trim() || 'Untitled';
  const answer = article.kind === 'item' ? article.reveal?.trim() : '';
  const answerSection = answer ? `\n\n## Answer\n\n${answer}` : '';
  const body = `${renderArticleBody(article, derivedChildren).trim()}${answerSection}${renderManualTopicAppendix(manualTopics, derivedChildren)}`.trim();
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
  resourceReferences?: NodeResourceReference[];
  updatedAt: string;
}

function collectAnchorChildren(parentId: string, derivedChildren: MirrorRenderableNode[]) {
  const map = new Map<string, ArticleNode[]>();
  for (const node of derivedChildren) {
    if (node.parentNodeId !== parentId) continue;
    const key = `${node.anchorLink?.kind}:${node.anchorLink?.id}`;
    map.set(key, [...(map.get(key) ?? []), node as ArticleNode]);
  }
  return map;
}

export function renderSingleArticleMirrorRaw(
  article: MirrorRenderableNode,
  derivedChildren: MirrorRenderableNode[],
  manualTopics: MirrorRenderableNode[]
): string {
  return renderArticleMarkdown(article as ArticleNode, derivedChildren, manualTopics as ArticleNode[]);
}
