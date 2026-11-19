import type { NativeSuperMemoPreviewRow } from '../../platform/nativeSuperMemoImportContract.js';
import { deriveNodeTitleFromContent } from '../nodes/deriveNodeTitle.js';

import { convertHtmlToMarkdownCompatible } from './htmlToMarkdownCompatible.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

const startingHeading = /^#\s+([^\n]+)/u;

export function superMemoElementTitle(element: SuperMemoXmlDraftElement, content: string, answer: string, referenceTitle?: string, useReferenceFallback = true) {
  const explicit = element.title && convertHtmlToMarkdownCompatible(element.title).content.trim();
  const heading = element.sourceType === 'Topic' ? startingHeading.exec(content) : null;
  const headingTitle = heading ? deriveNodeTitleFromContent(heading[0]) : '';
  if (explicit) {
    const exported = /^Title:[ \t]*(.*)$/iu.exec(explicit)?.[1];
    if (exported && headingTitle && headingTitle === referenceTitle &&
        (exported === headingTitle || exported.startsWith(headingTitle + ' '))) return headingTitle;
    return explicit;
  }
  if (headingTitle) return headingTitle;
  if (useReferenceFallback && element.sourceType === 'Topic' && referenceTitle?.trim()) return referenceTitle.trim();
  return (content || answer).slice(0, 140);
}

export function superMemoReferenceHeading(row: NativeSuperMemoPreviewRow) {
  const title = row.sourceBibliography?.title?.trim();
  return row.outcome === 'topic' && title === row.title ? title : undefined;
}

export function addSuperMemoReferenceHeading(content: string, title: string | undefined) {
  if (!title || startingHeading.test(content)) return content;
  const inline = title.replace(/\s+/gu, ' ').replace(/[\\`*_{}[\]<>#]/gu, '\\$&');
  return [`# ${inline}`, content].filter(Boolean).join('\n\n');
}
