import type { EditorSearchDecorations } from '../adapters/EditorAdapter';

export interface TopicSearchMatch {
  from: number;
  to: number;
}

export function buildTopicSearchMatches(content: string, query: string): TopicSearchMatch[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const normalizedContent = content.toLocaleLowerCase();
  const matches: TopicSearchMatch[] = [];
  let searchStart = 0;
  while (searchStart < normalizedContent.length) {
    const foundAt = normalizedContent.indexOf(normalizedQuery, searchStart);
    if (foundAt < 0) {
      break;
    }
    matches.push({ from: foundAt, to: foundAt + normalizedQuery.length });
    searchStart = foundAt + 1;
  }
  return matches;
}

export function resolveTopicSearchStatusLabel(query: string, currentIndex: number, total: number) {
  if (!query.trim()) {
    return '';
  }
  if (total <= 0) {
    return 'No matches';
  }
  return `${currentIndex + 1} / ${total}`;
}

export function buildTopicSearchDecorations(
  query: string,
  matches: TopicSearchMatch[],
  currentIndex: number
): EditorSearchDecorations | null {
  if (!query.trim() || matches.length === 0) {
    return null;
  }

  return {
    activeIndex: Math.max(0, Math.min(currentIndex, matches.length - 1)),
    matches
  };
}
