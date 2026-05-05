import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../../shared/ui';
import { buildFootnotePresentation } from '../model/footnotePresentation';
import { tokenizeMarkdownTableInlineText } from '../model/markdownTableInline';
import { getMarkdownTableCellAnchorClasses } from '../model/markdownTablePlans';
import type { MarkdownTablePreviewRequest } from '../model/markdownTablePreview';

const tableClassName =
  'w-full table-fixed border-separate border-spacing-0 border-y border-border-strong/70 text-left [font-size:var(--content-panel-font-size,1.0625rem)] [line-height:var(--content-panel-line-height,1.75)]';
const cellClassName =
  'min-w-[2ch] whitespace-normal border-b border-border/45 px-3 py-2 text-left align-top break-words [overflow-wrap:anywhere]';
const headerCellClassName = `${cellClassName} border-b border-border-strong/70 bg-canvas font-semibold`;
const COLUMN_SPLIT_PATTERN = /[\s,，、/|;；:：()[\]{}]+/;
interface MarkdownTablePreviewDialogProps {
  onOpenChange: (open: boolean) => void;
  table: MarkdownTablePreviewRequest | null;
}

function measureVisualTextLength(text: string) {
  return Array.from(text.trim()).reduce((sum, character) => {
    if (/\s/.test(character)) return sum + 0.35;
    if (/[A-Za-z0-9]/.test(character)) return sum + 1;
    return sum + (character.charCodeAt(0) > 255 ? 2 : 0.7);
  }, 0);
}

function measureCellWidthScore(text: string) {
  const segments = text.split(COLUMN_SPLIT_PATTERN).filter(Boolean);
  const longestSegment = Math.max(0, ...segments.map(measureVisualTextLength));
  const total = measureVisualTextLength(text);
  return Math.max(3, Math.min(72, longestSegment * 1.25 + Math.sqrt(total) * 2.6));
}

function resolveColumnBounds(columnCount: number) {
  return {
    max: Math.max(100 / columnCount, Math.min(50, Math.max(18, 180 / columnCount))),
    min: Math.min(12, Math.max(5, 48 / columnCount))
  };
}

function normalizeColumnPercents(scores: number[]) {
  const columnCount = Math.max(scores.length, 1);
  const totalScore = scores.reduce((sum, item) => sum + item, 0);
  const preferred = scores.map((score) => (score / totalScore) * 100);
  const { max, min } = resolveColumnBounds(columnCount);
  const locked = new Set<number>();
  const widths = [...preferred];

  for (let pass = 0; pass < columnCount; pass += 1) {
    widths.forEach((width, index) => {
      if (locked.has(index)) return;
      if (width < min || width > max) {
        widths[index] = width < min ? min : max;
        locked.add(index);
      }
    });

    const remaining = 100 - widths.reduce((sum, width, index) => sum + (locked.has(index) ? width : 0), 0);
    const unlocked = widths.map((_, index) => index).filter((index) => !locked.has(index));
    const unlockedScore = unlocked.reduce((sum, index) => sum + preferred[index], 0);
    if (!unlocked.length || unlockedScore <= 0) break;
    unlocked.forEach((index) => {
      widths[index] = (preferred[index] / unlockedScore) * remaining;
    });
  }

  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * 100);
}

function resolveColumnWidths(preview: MarkdownTablePreviewRequest, columnCount: number) {
  return normalizeColumnPercents(resolveColumnScores(preview, columnCount));
}

function resolveColumnScores(preview: MarkdownTablePreviewRequest, columnCount: number) {
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const cells = preview.table.rows.map((row) => row.cells[columnIndex]?.text ?? '');
    return Math.max(...cells.map(measureCellWidthScore));
  });
}

function resolvePreviewWidthStyle(preview: MarkdownTablePreviewRequest, columnCount: number) {
  const totalScore = resolveColumnScores(preview, columnCount).reduce((sum, score) => sum + score, 0);
  const minWidth = Math.min(760, Math.max(420, columnCount * 132));
  const idealWidth = Math.min(1500, Math.max(minWidth, totalScore * 9 + 160));
  return { width: `clamp(${minWidth}px, ${idealWidth}px, calc(100vw - 7rem))` };
}

function renderPreviewTable(preview: MarkdownTablePreviewRequest) {
  const columnCount = Math.max(preview.table.columnCount, 1);
  const columnWidths = resolveColumnWidths(preview, columnCount);

  return (
    <div className="w-full">
      <table className={tableClassName}>
        {renderColumnGroup(columnWidths)}
        <tbody>
          {preview.table.rows.map((row, rowIndex) => renderTableRow(preview, row, columnCount, rowIndex))}
        </tbody>
      </table>
    </div>
  );
}

function renderPreviewHeaderOverlay(preview: MarkdownTablePreviewRequest, columnCount: number) {
  const columnWidths = resolveColumnWidths(preview, columnCount);
  const headerRows = preview.table.rows.filter((row) => row.kind === 'header');
  if (!headerRows.length) return null;

  return (
    <div className="pointer-events-none absolute inset-x-10 top-8 z-[2] bg-canvas">
      <table className={tableClassName} aria-hidden="true">
        {renderColumnGroup(columnWidths)}
        <tbody>{headerRows.map((row, rowIndex) => renderTableRow(preview, row, columnCount, rowIndex))}</tbody>
      </table>
    </div>
  );
}

function renderColumnGroup(columnWidths: number[]) {
  return (
    <colgroup>
      {columnWidths.map((width, index) => (
        <col key={index} style={{ width: `${width.toFixed(2)}%` }} />
      ))}
    </colgroup>
  );
}

function renderTableRow(
  preview: MarkdownTablePreviewRequest,
  previewRow: MarkdownTablePreviewRequest['table']['rows'][number],
  columnCount: number,
  rowIndex: number
) {
  return (
    <tr className="last:[&_td]:border-b-0" key={rowIndex}>
      {Array.from({ length: columnCount }, (_, columnIndex) => {
        const cell = previewRow.cells[columnIndex] ?? { align: null, from: previewRow.to, text: '', to: previewRow.to };
        const Tag = previewRow.kind === 'header' ? 'th' : 'td';
        return (
          <Tag
            className={resolveCellClassName(preview, cell, previewRow.kind === 'header')}
            key={columnIndex}
            style={cell.align ? { textAlign: cell.align } : undefined}
          >
            {renderCellInlineContent(cell.text.trim())}
          </Tag>
        );
      })}
    </tr>
  );
}

function resolveCellClassName(
  preview: MarkdownTablePreviewRequest,
  cell: MarkdownTablePreviewRequest['table']['rows'][number]['cells'][number],
  isHeader: boolean
) {
  const classNames = [isHeader ? headerCellClassName : cellClassName];
  const { hasCloze, hasHighlight } = getMarkdownTableCellAnchorClasses(cell, preview.table.anchorDecorations);
  if (hasHighlight) classNames.push('cm-md-highlight');
  if (hasCloze) classNames.push('cm-md-cloze');
  return classNames.join(' ');
}

function renderCellInlineContent(text: string) {
  return tokenizeMarkdownTableInlineText(text).map((token, index) => {
    if (token.kind === 'emphasis') return <em className="cm-md-emphasis" key={index}>{token.text}</em>;
    if (token.kind === 'strong') return <strong className="font-semibold" key={index}>{token.text}</strong>;
    if (token.kind === 'strikethrough') return <s key={index}>{token.text}</s>;
    if (token.kind === 'sourceHighlight') return <mark className="cm-md-source-highlight" key={index}>{token.text}</mark>;
    if (token.kind === 'inlineCode') return <code className="rounded-sm bg-foreground/5 px-1 font-mono text-[0.9em]" key={index}>{token.text}</code>;
    if (token.kind === 'autolink' || token.kind === 'link') {
      return <span className="cursor-pointer text-accent underline" data-md-link-url={token.href} key={index}>{token.text}</span>;
    }
    if (token.kind === 'footnote') return renderFootnoteInlineContent(token.label, token.note, index);
    if (token.kind === 'wikiLink') {
      return <span className="cursor-pointer text-accent underline" data-md-link-node-title={token.title} key={index}>{token.text}</span>;
    }
    return token.text;
  });
}

function renderFootnoteInlineContent(label: string, note: string | null, key: number) {
  const presentation = buildFootnotePresentation({ label, note });
  return (
    <span className="cm-md-footnote-widget" data-md-footnote-label={presentation.label} data-md-footnote-status={presentation.status} key={key}>
      <span className="cm-md-footnote-marker" aria-label={presentation.ariaLabel} title={presentation.note ?? undefined}>{presentation.label}</span>
    </span>
  );
}

export function MarkdownTablePreviewDialog(props: MarkdownTablePreviewDialogProps) {
  const columnCount = Math.max(props.table?.table.columnCount ?? 1, 1);
  const panelStyle = props.table ? resolvePreviewWidthStyle(props.table, columnCount) : undefined;

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={Boolean(props.table)}>
      <AppDialogPortal>
        <AppDialogOverlay className="bg-foreground/60" />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 z-[90] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-visible border-transparent bg-transparent p-0 shadow-none"
        >
          <AppDialogTitle className="sr-only">Table preview</AppDialogTitle>
          <div
            className="relative max-h-[88vh] overflow-hidden rounded-md border border-border bg-canvas shadow-popover"
            style={panelStyle}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-8 bg-canvas" />
            {props.table ? renderPreviewHeaderOverlay(props.table, columnCount) : null}
            <div className="app-scrollbar max-h-[88vh] overflow-y-auto overflow-x-hidden px-10 pb-8 pt-8 [--app-scrollbar-thumb-color:rgb(var(--color-foreground)/0.04)] [--app-scrollbar-thumb-hover-color:rgb(var(--color-foreground)/0.12)]">
              {props.table ? renderPreviewTable(props.table) : null}
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
