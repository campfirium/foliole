import type { SyntaxNode } from '@lezer/common';
import { GFM, parser } from '@lezer/markdown';

const markdownParser = parser.configure(GFM);
const MARKERS = new Set(['CodeMark', 'EmphasisMark', 'HeaderMark', 'LinkMark', 'ListMark', 'QuoteMark', 'TaskMarker']);

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function children(node: SyntaxNode) {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function safeUrl(value: string, image: boolean) {
  try {
    const url = new URL(value);
    const protocols = image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderLink(node: SyntaxNode, source: string, image: boolean) {
  const raw = source.slice(node.from, node.to);
  const match = image
    ? /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/u.exec(raw)
    : /^\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)$/u.exec(raw);
  if (!match) return escapeHtml(raw);
  const label = match[1] ?? '';
  const target = match[2];
  if (!target) return escapeHtml(raw);
  const destination = safeUrl(target, image);
  if (!destination) return escapeHtml(label);
  return image
    ? `<img src="${escapeAttribute(destination)}" alt="${escapeAttribute(label)}" />`
    : `<a href="${escapeAttribute(destination)}">${escapeHtml(label)}</a>`;
}

function renderInlineChildren(node: SyntaxNode, source: string) {
  let cursor = node.from;
  const output: string[] = [];
  for (const child of children(node)) {
    output.push(escapeHtml(source.slice(cursor, child.from)), renderInline(child, source));
    cursor = child.to;
  }
  output.push(escapeHtml(source.slice(cursor, node.to)));
  return output.join('');
}

function renderInline(node: SyntaxNode, source: string): string {
  if (MARKERS.has(node.name)) return '';
  if (node.name === 'Emphasis') return `<em>${renderInlineChildren(node, source)}</em>`;
  if (node.name === 'StrongEmphasis') return `<strong>${renderInlineChildren(node, source)}</strong>`;
  if (node.name === 'Strikethrough') return `<del>${renderInlineChildren(node, source)}</del>`;
  if (node.name === 'Link') return renderLink(node, source, false);
  if (node.name === 'Image') return renderLink(node, source, true);
  if (node.name === 'URL') {
    const raw = source.slice(node.from, node.to);
    const destination = safeUrl(raw, false);
    return destination ? `<a href="${escapeAttribute(destination)}">${escapeHtml(raw)}</a>` : escapeHtml(raw);
  }
  if (node.name === 'InlineCode') {
    return `<code>${escapeHtml(source.slice(node.from, node.to).replace(/^`|`$/gu, ''))}</code>`;
  }
  if (node.name === 'HardBreak') return '<br />';
  return node.firstChild ? renderInlineChildren(node, source) : escapeHtml(source.slice(node.from, node.to));
}

function renderFencedCode(node: SyntaxNode, source: string) {
  const code = children(node).find((child) => child.name === 'CodeText');
  const info = children(node).find((child) => child.name === 'CodeInfo');
  const language = info ? source.slice(info.from, info.to).trim().replace(/[^a-z0-9_-]/giu, '') : '';
  const className = language ? ` class="language-${escapeAttribute(language)}"` : '';
  return `<pre><code${className}>${escapeHtml(code ? source.slice(code.from, code.to) : '')}</code></pre>`;
}

function renderTable(node: SyntaxNode, source: string) {
  const rows = children(node).filter((child) => child.name === 'TableHeader' || child.name === 'TableRow');
  return `<table>${rows.map((row, index) => {
    const tag = index === 0 && row.name === 'TableHeader' ? 'th' : 'td';
    const cells = children(row).filter((child) => child.name === 'TableCell');
    return `<tr>${cells.map((cell) => `<${tag}>${renderInlineChildren(cell, source)}</${tag}>`).join('')}</tr>`;
  }).join('')}</table>`;
}

function renderBlock(node: SyntaxNode, source: string): string {
  if (node.name === 'Paragraph') return `<p>${renderInlineChildren(node, source)}</p>`;
  if (/^ATXHeading[1-6]$/u.test(node.name)) {
    const level = node.name.at(-1);
    return `<h${level}>${renderInlineChildren(node, source).trim()}</h${level}>`;
  }
  if (node.name === 'BulletList') return `<ul>${children(node).map((child) => renderBlock(child, source)).join('')}</ul>`;
  if (node.name === 'OrderedList') return `<ol>${children(node).map((child) => renderBlock(child, source)).join('')}</ol>`;
  if (node.name === 'ListItem') return `<li>${children(node).map((child) => renderBlock(child, source)).join('')}</li>`;
  if (node.name === 'Blockquote') return `<blockquote>${children(node).map((child) => renderBlock(child, source)).join('')}</blockquote>`;
  if (node.name === 'FencedCode') return renderFencedCode(node, source);
  if (node.name === 'HorizontalRule') return '<hr />';
  if (node.name === 'Table') return renderTable(node, source);
  if (MARKERS.has(node.name)) return '';
  return node.firstChild
    ? children(node).map((child) => renderBlock(child, source)).join('')
    : `<p>${escapeHtml(source.slice(node.from, node.to))}</p>`;
}

export function convertWordPressMarkdownToHtml(markdown: string) {
  const tree = markdownParser.parse(markdown);
  return children(tree.topNode).map((node) => renderBlock(node, markdown)).join('\n');
}
