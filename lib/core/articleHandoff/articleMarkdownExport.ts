import type { ArticleBody } from '../../platform/articleTarget.js';

const FRONTMATTER_DELIMITER = /^\s*---\s*$/u;
const LEVEL_ONE_HEADING = /^\s{0,3}#\s+\S/u;

function splitLeadingFrontmatter(lines: string[]) {
  if (!FRONTMATTER_DELIMITER.test(lines[0] ?? '')) return 0;
  const closing = lines.findIndex((line, index) => index > 0 && FRONTMATTER_DELIMITER.test(line));
  return closing > 0 ? closing + 1 : 0;
}

export function renderArticleMarkdownExport(article: ArticleBody) {
  const title = article.title.trim() || 'Untitled';
  const lines = article.markdown.replace(/\r\n?/gu, '\n').split('\n');
  const bodyStart = splitLeadingFrontmatter(lines);
  const firstContent = lines.findIndex((line, index) => index >= bodyStart && line.trim().length > 0);
  if (firstContent >= 0 && LEVEL_ONE_HEADING.test(lines[firstContent] ?? '')) {
    return `${lines.join('\n').trimEnd()}\n`;
  }
  const frontmatter = lines.slice(0, bodyStart).join('\n');
  const body = lines.slice(bodyStart).join('\n').trim();
  return [frontmatter, `# ${title}`, body].filter(Boolean).join('\n\n') + '\n';
}

export function articleMarkdownFileName(title: string) {
  const cleaned = Array.from(title)
    .map(character => character.charCodeAt(0) <= 31 || '<>:"/\\|?*'.includes(character) ? ' ' : character)
    .join('')
    .replace(/\s+/gu, ' ')
    .replace(/[.\s]+$/gu, '')
    .replace(/^[.\s]+/gu, '')
    .trim();
  const limited = Array.from(cleaned).slice(0, 80).join('').trim();
  return `${limited || 'Untitled'}.md`;
}
