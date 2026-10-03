import { buildTopicSearchMatches } from '../features/editor/model/documentTopicSearch';

export interface CompanionSearchMatch {
  matchStart: number;
  query: string;
}

export function resolveCompanionSearchSelection(content: string, match?: CompanionSearchMatch | null) {
  if (!match) return null;
  const matches = buildTopicSearchMatches(content, match.query);
  // SQLite offsets count Unicode code points; editor selections count UTF-16 code units.
  const offset = Array.from(content).slice(0, match.matchStart).join('').length;
  return matches.find((candidate) => candidate.from === offset) ?? matches[0] ?? null;
}
