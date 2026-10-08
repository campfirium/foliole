import type { AnchoredImportedHighlightRecord } from '../database/importHighlightAnchors.js';
import { normalizeNodeTitle } from '../nodes/nodeTitleBudget.js';

import type { PreparedImportHighlightRecord } from './contract.js';
import { projectImageOnlyMarkdownLabel } from './markdownImageLabel.js';

export function deriveImportedHighlightTitleCandidate(content: string) {
  const imageOnlyTitle = projectImageOnlyMarkdownLabel(content);
  if (imageOnlyTitle) {
    return imageOnlyTitle;
  }
  const firstLine = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').replace(/^#{1,6}\s+/, ''))
    .find((line) => line.length > 0);
  if (!firstLine) {
    return 'Untitled';
  }
  return firstLine.replace(/\s+/g, ' ');
}

export function deriveImportedHighlightTitle(content: string) {
  return normalizeNodeTitle(deriveImportedHighlightTitleCandidate(content));
}

export function toImportedAnchorLink(highlight: PreparedImportHighlightRecord | AnchoredImportedHighlightRecord) {
  if (!('anchorId' in highlight)) {
    return null;
  }
  if (typeof highlight.from !== 'number' || typeof highlight.to !== 'number') {
    return JSON.stringify({ id: highlight.anchorId, kind: highlight.kind, origin: 'imported' });
  }
  return JSON.stringify({
    id: highlight.anchorId,
    kind: highlight.kind,
    origin: 'imported',
    locator: {
      from: highlight.from,
      to: highlight.to,
      originalText: highlight.locatorText ?? highlight.content
    }
  });
}

export function createImportedClozePrompt(parentContent: string, highlight: AnchoredImportedHighlightRecord) {
  if (typeof highlight.from !== 'number' || typeof highlight.to !== 'number') {
    return '[...]';
  }
  return `${parentContent.slice(0, highlight.from)}[...]${parentContent.slice(highlight.to)}`.trim() || '[...]';
}
