import type { DemoMarkdownImportEntry } from './demoMarkdownImport';

export function normalizeDemoImportedContent(entry: DemoMarkdownImportEntry) {
  const content = entry.markdown.trim().replace(/\r\n?/g, '\n');
  if (!shouldNormalizePlainTextParagraphs(entry, content)) {
    return content;
  }
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .reduce<string[]>((lines, line) => {
      if (line.trim().length === 0) {
        if (lines.at(-1) !== '') lines.push('');
        return lines;
      }
      if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
      lines.push(line);
      return lines;
    }, [])
    .join('\n')
    .trim();
}

function shouldNormalizePlainTextParagraphs(entry: DemoMarkdownImportEntry, content: string) {
  if (isTextFileName(entry.relativePath ?? '') || isTextFileName(entry.sourceName ?? '')) {
    return true;
  }
  return entry.sourceName === 'Pasted Markdown' && looksLikePlainTextArticle(content);
}

function isTextFileName(name: string) {
  return name.toLowerCase().endsWith('.txt');
}

function looksLikePlainTextArticle(content: string) {
  const lines = content.split('\n');
  if (lines.some((line) => line.trim().length === 0)) return false;
  if (lines.filter((line) => line.trim().length > 0).length < 3) return false;
  return !lines.some((line) => isMarkdownStructureLine(line));
}

function isMarkdownStructureLine(line: string) {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s/.test(trimmed) ||
    /^[-*+]\s/.test(trimmed) ||
    /^\d+[.)]\s/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^\|.+\|$/.test(trimmed)
  );
}
