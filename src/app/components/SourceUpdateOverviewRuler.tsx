import { useMemo } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import type { SourceUpdateOverviewKind, SourceUpdateOverviewSegment } from './sourceUpdateDiffModel';

function buildLineStartPositions(content: string) {
  const starts = [0];
  let position = 0;

  content.split('\n').forEach((line) => {
    starts.push(position);
    position += line.length + 1;
  });

  return starts;
}

function getLineStartPosition(lineStarts: number[], lineNumber: number | null) {
  if (!lineNumber || lineNumber < 1) {
    return null;
  }
  return lineStarts[Math.min(lineNumber, lineStarts.length - 1)] ?? null;
}

function getMarkerClassName(kind: SourceUpdateOverviewKind) {
  if (kind === 'current-only') {
    return 'bg-destructive/75 hover:bg-destructive';
  }
  if (kind === 'updated-only') {
    return 'bg-accent/70 hover:bg-accent';
  }
  return 'bg-foreground/55 hover:bg-foreground';
}

function getMarkerLabel(segment: SourceUpdateOverviewSegment) {
  if (segment.kind === 'current-only') {
    return `Jump to lines only in current draft around row ${segment.row}`;
  }
  if (segment.kind === 'updated-only') {
    return `Jump to lines only in updated source around row ${segment.row}`;
  }
  return `Jump to changed lines around row ${segment.row}`;
}

function jumpEditorsToSegment(
  segment: SourceUpdateOverviewSegment,
  currentEditor: EditorAdapter | null,
  currentLineStarts: number[],
  updatedEditor: EditorAdapter | null,
  updatedLineStarts: number[]
) {
  const currentPosition = getLineStartPosition(currentLineStarts, segment.currentLineNumber);
  const updatedPosition = getLineStartPosition(updatedLineStarts, segment.updatedLineNumber);

  if (currentPosition !== null) {
    currentEditor?.revealPosition(currentPosition);
  }
  if (updatedPosition !== null) {
    updatedEditor?.revealPosition(updatedPosition);
  }
}

function renderOverviewMarkers(
  overviewSegments: SourceUpdateOverviewSegment[],
  totalRows: number,
  onMarkerClick: (segment: SourceUpdateOverviewSegment) => void
) {
  return overviewSegments.map((segment) => {
    const top = ((segment.row - 1) / totalRows) * 100;
    const height = (Math.max(segment.endRow - segment.row + 1, 1) / totalRows) * 100;

    return (
      <button
        aria-label={getMarkerLabel(segment)}
        className={`pointer-events-auto absolute inset-x-0 transition-colors ${getMarkerClassName(segment.kind)}`}
        data-kind={segment.kind}
        data-testid="source-update-overview-marker"
        key={segment.id}
        onClick={(event) => {
          event.stopPropagation();
          onMarkerClick(segment);
        }}
        style={{
          height: `max(${height}%, 6px)`,
          top: `${top}%`
        }}
        type="button"
      />
    );
  });
}

export function SourceUpdateOverviewRuler({
  currentContent,
  currentEditor,
  overviewSegments,
  totalRows,
  updatedContent,
  updatedEditor
}: {
  currentContent: string;
  currentEditor: EditorAdapter | null;
  overviewSegments: SourceUpdateOverviewSegment[];
  totalRows: number;
  updatedContent: string;
  updatedEditor: EditorAdapter | null;
}) {
  const currentLineStarts = useMemo(() => buildLineStartPositions(currentContent), [currentContent]);
  const updatedLineStarts = useMemo(() => buildLineStartPositions(updatedContent), [updatedContent]);
  const handleMarkerClick = (segment: SourceUpdateOverviewSegment) => {
    jumpEditorsToSegment(segment, currentEditor, currentLineStarts, updatedEditor, updatedLineStarts);
  };

  return (
    <aside
      aria-label="Comparison overview ruler"
      className="pointer-events-none absolute bottom-4 right-[calc(var(--app-scrollbar-size)+14px)] top-4 z-10 w-3"
      data-testid="source-update-overview-ruler"
    >
      <div className="relative h-full w-full">
        {renderOverviewMarkers(overviewSegments, totalRows, handleMarkerClick)}
      </div>
    </aside>
  );
}
