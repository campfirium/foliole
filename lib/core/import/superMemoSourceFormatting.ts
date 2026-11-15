import type { SuperMemoBibliography } from './superMemoBibliography.js';

export interface SuperMemoSourceFormat {
  placement: 'metadata' | 'body';
  template: string;
}

export const DEFAULT_SUPER_MEMO_SOURCE_FORMAT: SuperMemoSourceFormat = {
  placement: 'metadata',
  template: 'Source: {articleLink}\nTitle: {title}\nAuthor: {author}\nURL: {url}\nDate: {date}\nPublisher: {publisher}\nNotes: {comment}'
};

export function formatSuperMemoSource(bibliography: SuperMemoBibliography | undefined,
  articleId: number | null | undefined, target: { id: string; title: string } | undefined, format: SuperMemoSourceFormat) {
  const title = target?.title.replace(/[[\]|\r\n]/gu, ' ').trim() || (articleId ? `SuperMemo #${articleId}` : '');
  const articleLink = target ? `[[node-id:${target.id}|${title}]]` : title;
  const values: Record<string, string | undefined> = { ...bibliography, articleLink };
  if (format.placement === 'metadata') {
    const valuesByKey: Record<string, string | number | undefined> = {
      supermemoArticle: articleLink, supermemoArticleId: articleId ?? undefined,
      ...Object.fromEntries(Object.entries(bibliography ?? {}).map(([key, value]) => [
        `supermemo${key[0]!.toUpperCase()}${key.slice(1)}`, value
      ]))
    };
    return Object.entries(valuesByKey).filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
  }
  return format.template.split('\n').flatMap(line => {
    const keys = [...line.matchAll(/\{([a-zA-Z]+)\}/gu)].map(match => match[1]!);
    if (keys.some(key => !Object.hasOwn(values, key) || !values[key])) return [];
    return [line.replace(/\{([a-zA-Z]+)\}/gu, (_, key: string) => values[key]!.replace(/[\r\n]+/gu, ' '))];
  }).join('\n').trim();
}

export function addSuperMemoSource(content: string, formatted: string, placement: SuperMemoSourceFormat['placement']) {
  if (!formatted) return content;
  if (placement === 'body') return [content, formatted].filter(Boolean).join('\n\n');
  if (content.startsWith('---\n') && content.includes('\n---', 4)) {
    const end = content.indexOf('\n---', 4);
    return `${content.slice(0, end)}\n${formatted}${content.slice(end)}`;
  }
  return `---\n${formatted}\n---\n\n${content}`;
}
