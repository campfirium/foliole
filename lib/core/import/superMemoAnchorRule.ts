import { findSuperMemoClozeLocator } from './superMemoClozeLocator.js';
import { findSuperMemoHighlightLocator } from './superMemoHighlightLocator.js';
import { readSuperMemoNativeMarks } from './superMemoNativeMarks.js';
import { prepareSuperMemoParentText, type SuperMemoParentText } from './superMemoParentText.js';

export function prepareSuperMemoAnchorSource(parts: string[], body: string, render: (parts: string[]) => string) {
  return prepareSuperMemoParentText(body, readSuperMemoNativeMarks(parts, body, render));
}

export function resolveSuperMemoTextAnchor(parent: SuperMemoParentText, kind: 'topic' | 'item', question: string[], answer: string) {
  return kind === 'topic' ? findSuperMemoHighlightLocator(parent, question) : findSuperMemoClozeLocator(parent, question, answer);
}
