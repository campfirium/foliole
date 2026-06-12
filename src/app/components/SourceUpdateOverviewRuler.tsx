import { ChevronDown, ChevronUp } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appSurfaceControlClassName } from '../../shared/ui';

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

function getMarkerClassName(kind: SourceUpdateOverviewKind, active: boolean) {
  if (kind === 'current-only') {
    return active ? 'bg-destructive' : 'bg-destructive/75 hover:bg-destructive';
  }
  if (kind === 'updated-only') {
    return active ? 'bg-accent' : 'bg-accent/70 hover:bg-accent';
  }
  return active ? 'bg-foreground/85' : 'bg-foreground/55 hover:bg-foreground';
}

type Translate = ReturnType<typeof useTranslation>;

function getMarkerLabel(t: Translate, segment: SourceUpdateOverviewSegment) {
  if (segment.kind === 'current-only') {
    return t('desktop.sourceUpdate.overview.marker.currentOnly', { row: segment.row });
  }
  if (segment.kind === 'updated-only') {
    return t('desktop.sourceUpdate.overview.marker.updatedOnly', { row: segment.row });
  }
  return t('desktop.sourceUpdate.overview.marker.changed', { row: segment.row });
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

function useActiveOverviewIndex(overviewSegments: SourceUpdateOverviewSegment[]) {
  const [activeIndex, setActiveIndex] = useState(() => (overviewSegments.length > 0 ? 0 : -1));

  useEffect(() => {
    if (overviewSegments.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => {
      if (current < 0) {
        return 0;
      }
      return Math.min(current, overviewSegments.length - 1);
    });
  }, [overviewSegments]);

  return { activeIndex, setActiveIndex };
}

function revealSegmentAtIndex(
  index: number,
  overviewSegments: SourceUpdateOverviewSegment[],
  onRevealSegment: (segment: SourceUpdateOverviewSegment) => void,
  setActiveIndex: (index: number) => void
) {
  const segment = overviewSegments[index];
  if (!segment) {
    return;
  }
  setActiveIndex(index);
  onRevealSegment(segment);
}

function OverviewNavButton(props: {
  ariaLabel: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.ariaLabel}
      className={appSurfaceControlClassName('pointer-events-auto flex h-5 w-5 items-center justify-center px-0 text-foreground/70')}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function renderOverviewMarkers(
  t: Translate,
  activeIndex: number,
  overviewSegments: SourceUpdateOverviewSegment[],
  totalRows: number,
  onMarkerClick: (index: number) => void
) {
  return overviewSegments.map((segment, index) => {
    const top = ((segment.row - 1) / totalRows) * 100;
    const height = (Math.max(segment.endRow - segment.row + 1, 1) / totalRows) * 100;

    return (
      <button
        aria-label={getMarkerLabel(t, segment)}
        className={`pointer-events-auto absolute inset-x-0 transition-colors ${getMarkerClassName(segment.kind, index === activeIndex)}`}
        data-kind={segment.kind}
        data-testid="source-update-overview-marker"
        key={segment.id}
        onClick={(event) => {
          event.stopPropagation();
          onMarkerClick(index);
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
  const t = useTranslation();
  const currentLineStarts = useMemo(() => buildLineStartPositions(currentContent), [currentContent]);
  const updatedLineStarts = useMemo(() => buildLineStartPositions(updatedContent), [updatedContent]);
  const { activeIndex, setActiveIndex } = useActiveOverviewIndex(overviewSegments);
  const handleRevealSegment = (segment: SourceUpdateOverviewSegment) => {
    jumpEditorsToSegment(segment, currentEditor, currentLineStarts, updatedEditor, updatedLineStarts);
  };
  const moveToPrevious = () => {
    if (overviewSegments.length === 0) {
      return;
    }
    const nextIndex = activeIndex <= 0 ? overviewSegments.length - 1 : activeIndex - 1;
    revealSegmentAtIndex(nextIndex, overviewSegments, handleRevealSegment, setActiveIndex);
  };
  const moveToNext = () => {
    if (overviewSegments.length === 0) {
      return;
    }
    const nextIndex = activeIndex >= overviewSegments.length - 1 ? 0 : activeIndex + 1;
    revealSegmentAtIndex(nextIndex, overviewSegments, handleRevealSegment, setActiveIndex);
  };
  return (
    <aside
      aria-label={t('desktop.sourceUpdate.overview.aria')}
      className="flex min-h-0 flex-1 flex-col items-center gap-2 px-1 py-3"
      data-testid="source-update-overview-ruler"
    >
      <OverviewNavButton ariaLabel={t('desktop.sourceUpdate.overview.previous')} onClick={moveToPrevious}>
        <ChevronUp aria-hidden="true" size={12} strokeWidth={2.2} />
      </OverviewNavButton>
      <div className="pointer-events-none relative flex-1 w-3">
        {renderOverviewMarkers(t, activeIndex, overviewSegments, totalRows, (index) =>
          revealSegmentAtIndex(index, overviewSegments, handleRevealSegment, setActiveIndex)
        )}
      </div>
      <OverviewNavButton ariaLabel={t('desktop.sourceUpdate.overview.next')} onClick={moveToNext}>
        <ChevronDown aria-hidden="true" size={12} strokeWidth={2.2} />
      </OverviewNavButton>
    </aside>
  );
}
