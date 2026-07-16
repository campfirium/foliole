import {
  parser as baseMarkdownParser,
  Strikethrough,
  Table,
  TaskList
} from '@lezer/markdown';
import type { ReactNode } from 'react';

const markdownParser = baseMarkdownParser.configure([Table, TaskList, Strikethrough]);
type MarkdownNode = ReturnType<typeof markdownParser.parse>['topNode'];

const MARKER_NODES = new Set([
  'CodeMark',
  'EmphasisMark',
  'HeaderMark',
  'LinkMark',
  'ListMark',
  'QuoteMark'
]);

export function WorkspaceRightSidebarAssistantMarkdown(props: { source: string }) {
  const tree = markdownParser.parse(props.source);
  return (
    <div className="min-w-0 w-full space-y-3 [overflow-wrap:anywhere] text-ui-md leading-6 text-foreground/86">
      {renderChildren(tree.topNode, props.source)}
    </div>
  );
}

function renderNode(node: MarkdownNode, source: string): ReactNode {
  const key = `${node.name}-${node.from}-${node.to}`;
  if (node.name === 'Paragraph') return <p className="m-0 whitespace-pre-wrap" key={key}>{renderChildren(node, source)}</p>;
  if (node.name.startsWith('ATXHeading')) return renderHeading(node, source, key);
  if (node.name === 'BulletList') return <ul className="m-0 list-disc space-y-1 pl-5" key={key}>{renderChildren(node, source)}</ul>;
  if (node.name === 'OrderedList') return <ol className="m-0 list-decimal space-y-1 pl-5" key={key}>{renderChildren(node, source)}</ol>;
  if (node.name === 'ListItem') return <li className="pl-0.5" key={key}>{renderChildren(node, source, true)}</li>;
  if (node.name === 'Blockquote') return <blockquote className="m-0 border-l-2 border-border-strong pl-3 text-foreground/68" key={key}>{renderChildren(node, source, true)}</blockquote>;
  if (node.name === 'StrongEmphasis') return <strong className="font-semibold text-foreground/92" key={key}>{renderChildren(node, source)}</strong>;
  if (node.name === 'Emphasis') return <em key={key}>{renderChildren(node, source)}</em>;
  if (node.name === 'Strikethrough') return <s key={key}>{renderChildren(node, source)}</s>;
  if (node.name === 'InlineCode') return <code className="rounded-sm bg-foreground/[0.065] px-1 py-0.5 font-mono text-ui-sm" key={key}>{trimCodeMarks(source.slice(node.from, node.to))}</code>;
  if (node.name === 'FencedCode' || node.name === 'IndentedCode') return renderCodeBlock(node, source, key);
  if (node.name === 'Link') return renderLink(node, source, key);
  if (node.name === 'Table') return renderTable(node, source, key);
  if (node.name === 'TaskMarker') return renderTaskMarker(node, source, key);
  if (node.name === 'HorizontalRule') return <hr className="my-2 border-border/80" key={key} />;
  if (node.name === 'HardBreak') return <br key={key} />;
  return <span key={key}>{renderChildren(node, source)}</span>;
}

function renderTable(node: MarkdownNode, source: string, key: string) {
  const header = findChildren(node, 'TableHeader');
  const rows = findChildren(node, 'TableRow');
  return (
    <div className="app-scrollbar max-w-full overflow-x-auto" key={key}>
      <table className="w-max min-w-full border-collapse text-left text-ui-sm leading-5">
        <thead className="bg-foreground/[0.045]">
          {header.map((row) => renderTableRow(row, source, true))}
        </thead>
        <tbody>{rows.map((row) => renderTableRow(row, source, false))}</tbody>
      </table>
    </div>
  );
}

function renderTableRow(node: MarkdownNode, source: string, header: boolean) {
  const cells = findChildren(node, 'TableCell');
  return (
    <tr key={`${node.name}-${node.from}-${node.to}`}>
      {cells.map((cell) => {
        const Cell = header ? 'th' : 'td';
        return (
          <Cell
            className="border border-border/80 px-2 py-1.5 align-top font-normal"
            key={`${cell.name}-${cell.from}-${cell.to}`}
          >
            {renderChildren(cell, source, true)}
          </Cell>
        );
      })}
    </tr>
  );
}

function renderTaskMarker(node: MarkdownNode, source: string, key: string) {
  const checked = /x/iu.test(source.slice(node.from, node.to));
  return (
    <input
      aria-hidden
      checked={checked}
      className="mr-1.5 size-3.5 align-[-0.1em] accent-current"
      disabled
      key={key}
      readOnly
      tabIndex={-1}
      type="checkbox"
    />
  );
}

function renderChildren(node: MarkdownNode, source: string, trimStart = false) {
  const output: ReactNode[] = [];
  let position = node.from;
  let child = node.firstChild;
  while (child) {
    pushText(output, source.slice(position, child.from), trimStart && output.length === 0);
    if (!MARKER_NODES.has(child.name)) output.push(renderNode(child, source));
    position = child.to;
    child = child.nextSibling;
  }
  pushText(output, source.slice(position, node.to), trimStart && output.length === 0);
  return output;
}

function pushText(output: ReactNode[], text: string, trimStart: boolean) {
  const value = trimStart ? text.trimStart() : text;
  if (value) output.push(value);
}

function renderHeading(node: MarkdownNode, source: string, key: string) {
  const level = Number(node.name.slice('ATXHeading'.length));
  const content = renderChildren(node, source, true);
  if (level === 1) return <h3 className="m-0 text-ui-lg font-semibold leading-7" key={key}>{content}</h3>;
  return <h4 className="m-0 text-ui-md font-semibold leading-6" key={key}>{content}</h4>;
}

function renderCodeBlock(node: MarkdownNode, source: string, key: string) {
  const code = findChild(node, 'CodeText');
  const value = code ? source.slice(code.from, code.to) : source.slice(node.from, node.to).trim();
  return <pre className="m-0 max-w-full overflow-x-auto rounded-md bg-foreground/[0.055] p-3 text-left" key={key}><code className="font-mono text-ui-sm leading-5">{value}</code></pre>;
}

function renderLink(node: MarkdownNode, source: string, key: string) {
  const raw = source.slice(node.from, node.to);
  const match = /^\[([\s\S]*?)\]\(([^\s)]+)(?:\s+['"][^'"]*['"])?\)$/u.exec(raw);
  if (!match) return <span key={key}>{raw}</span>;
  const href = safeHref(match[2] ?? '');
  return href
    ? <a className="text-accent underline decoration-current/40 underline-offset-2" href={href} key={key} rel="noreferrer" target="_blank">{match[1]}</a>
    : <span key={key}>{match[1]}</span>;
}

function findChild(node: MarkdownNode, name: string) {
  let child = node.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

function findChildren(node: MarkdownNode, name: string) {
  const children: MarkdownNode[] = [];
  let child = node.firstChild;
  while (child) {
    if (child.name === name) children.push(child);
    child = child.nextSibling;
  }
  return children;
}

function trimCodeMarks(value: string) {
  return value.replace(/^`+|`+$/gu, '');
}

function safeHref(value: string) {
  return /^(https?:|mailto:)/iu.test(value) ? value : null;
}
