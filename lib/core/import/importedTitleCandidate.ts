import { NODE_TITLE_MAX_CHARS, normalizeNodeTitle } from '../nodes/nodeTitleBudget.js';

/** The same collision suffix and character budget apply to every import host. */
export function importedTitleCandidate(desiredTitle: string, sequence = 1) {
  const base = normalizeNodeTitle(desiredTitle.trim() || 'Untitled');
  if (sequence === 1) return base;
  const suffix = ` ${sequence}`;
  return `${Array.from(base).slice(0, NODE_TITLE_MAX_CHARS - suffix.length).join('')}${suffix}`;
}
