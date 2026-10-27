import { folioleMarkdownParser } from './folioleMarkdownParser';

export type MarkdownProjectionTree = ReturnType<typeof folioleMarkdownParser.parse>;
let activeProjection: { source: string; tree: MarkdownProjectionTree | null } | null = null;

// Share one complete-string parse only while a synchronous projection is being built.
export function withMarkdownProjectionParse<T>(source: string, build: () => T): T {
  const previous = activeProjection;
  activeProjection = { source, tree: null };
  try { return build(); }
  finally { activeProjection = previous; }
}

export function parseMarkdownProjectionText(source: string): MarkdownProjectionTree {
  if (activeProjection?.source !== source) return folioleMarkdownParser.parse(source);
  return activeProjection.tree ??= folioleMarkdownParser.parse(source);
}
