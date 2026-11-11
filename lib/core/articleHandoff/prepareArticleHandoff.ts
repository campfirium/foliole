import type { ArticleBody } from '../../platform/articleTarget.js';

export async function prepareArticleHandoff(
  flushDraft: () => Promise<boolean>,
  readDocument: () => Promise<{ content: string; title: string } | null>
): Promise<ArticleBody | null> {
  if (!await flushDraft()) return null;
  const document = await readDocument();
  return document ? { title: document.title, markdown: document.content } : null;
}

export function resolveArticleHandoffLanguage(markdown: string, fallback: string) {
  const sample = markdown.slice(0, 8000);
  const hanCount = (sample.match(/\p{Script=Han}/gu) ?? []).length;
  const latinCount = (sample.match(/\p{Script=Latin}/gu) ?? []).length;
  return hanCount > latinCount / 3 ? 'zh-CN' : (fallback.startsWith('zh') ? 'en' : fallback);
}
