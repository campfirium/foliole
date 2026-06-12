import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { OutlineList } from './DocumentOutlineLayerList';
import {
  getOutlineClosedLayerWidth,
  getOutlineLayerWidth,
  mayHaveOutline,
  type OutlineDisplayItem,
  type OutlineHorizontalMetrics,
  resolveActiveIndex,
  resolveDisplayItems,
  resolveOutlineHorizontalMetrics
} from './DocumentOutlineLayerModel';
import { useOutlinePanelPositioning } from './documentOutlineLayerPositioning';

interface DocumentOutlineLayerProps {
  content: string;
  documentMaxWidth: number;
  onRevealPosition: (position: number) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
}

const HOVER_ZONE_WIDTH_PX = 72;
const OUTLINE_OPEN_DELAY_MS = 120;
const OUTLINE_EDGE_CLEARANCE_PX = 12;

function getOutlineLayerStyle(
  documentMaxWidth: number,
  horizontalMetrics: OutlineHorizontalMetrics,
  isOpen: boolean
) {
  return {
    right: `${OUTLINE_EDGE_CLEARANCE_PX}px`,
    width: isOpen ? `${getOutlineLayerWidth(horizontalMetrics, true)}px` : getOutlineClosedLayerWidth(documentMaxWidth)
  };
}

function useOutlineHoverState(
  documentMaxWidth: number,
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null,
  resolveOutlineItems: () => OutlineDisplayItem[]
) {
  const [anchorPosition, setAnchorPosition] = useState(0);
  const [horizontalMetrics, setHorizontalMetrics] = useState<OutlineHorizontalMetrics>({
    panelRight: 0,
    panelWidth: HOVER_ZONE_WIDTH_PX
  });
  const [isOpen, setIsOpen] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const openDelayTimerRef = useRef<number | null>(null);

  const clearOpenDelay = () => {
    if (openDelayTimerRef.current === null) {
      return;
    }
    window.clearTimeout(openDelayTimerRef.current);
    openDelayTimerRef.current = null;
  };

  const openOutline = (clientY: number) => {
    clearOpenDelay();
    openDelayTimerRef.current = window.setTimeout(() => {
      openDelayTimerRef.current = null;
      if (!layerRef.current) {
        return;
      }
      if (resolveOutlineItems().length === 0) {
        return;
      }
      const rect = layerRef.current.getBoundingClientRect();
      const containerWidth = layerRef.current.parentElement?.getBoundingClientRect().width ?? rect.width;
      const nextAnchorPosition = onResolveDocumentPositionAtViewportY(clientY);
      setHorizontalMetrics(resolveOutlineHorizontalMetrics(containerWidth, documentMaxWidth));
      if (nextAnchorPosition !== null) {
        setAnchorPosition(nextAnchorPosition);
      }
      setIsOpen(true);
    }, OUTLINE_OPEN_DELAY_MS);
  };

  const closeOutline = () => {
    clearOpenDelay();
    setIsOpen(false);
  };

  useEffect(() => clearOpenDelay, []);

  return {
    anchorPosition,
    closeOutline,
    horizontalMetrics,
    isOpen,
    layerRef,
    openOutline
  };
}

export function DocumentOutlineLayer({
  content,
  documentMaxWidth,
  onRevealPosition,
  onResolveDocumentPositionAtViewportY
}: DocumentOutlineLayerProps) {
  const t = useTranslation(), [outlineItems, setOutlineItems] = useState<OutlineDisplayItem[] | null>(null);
  const deferredContent = useDeferredValue(content);
  const hasOutlineCandidate = useMemo(() => mayHaveOutline(deferredContent), [deferredContent]);
  const resolveOutlineItems = useCallback(() => {
    if (outlineItems !== null) {
      return outlineItems;
    }
    const nextItems = resolveDisplayItems(content);
    setOutlineItems(nextItems);
    return nextItems;
  }, [content, outlineItems]);
  useEffect(() => {
    setOutlineItems(null);
  }, [content]);
  const { anchorPosition, closeOutline, horizontalMetrics, isOpen, layerRef, openOutline } =
    useOutlineHoverState(documentMaxWidth, onResolveDocumentPositionAtViewportY, resolveOutlineItems);
  const resolvedOutlineItems = outlineItems ?? [];
  const activeIndex = useMemo(
    () => resolveActiveIndex(resolvedOutlineItems, anchorPosition),
    [anchorPosition, resolvedOutlineItems]
  );
  const { setActiveItemRef, setPanelRef } = useOutlinePanelPositioning({
    activeIndex,
    isOpen,
    items: resolvedOutlineItems
  });

  if (!hasOutlineCandidate) {
    return null;
  }

  return (
    <div
      aria-label={t('desktop.document.outlineHoverZone')}
      className="pointer-events-auto absolute inset-y-0 right-0 z-surface-overlay"
      onMouseEnter={(event) => {
        openOutline(event.clientY);
      }}
      onMouseLeave={closeOutline}
      ref={layerRef}
      style={getOutlineLayerStyle(documentMaxWidth, horizontalMetrics, isOpen)}
    >
      <OutlineList
        activeIndex={activeIndex}
        horizontalMetrics={horizontalMetrics}
        isOpen={isOpen}
        items={resolvedOutlineItems}
        onRevealPosition={onRevealPosition}
        panelRef={setPanelRef}
        setActiveItemRef={setActiveItemRef}
      />
    </div>
  );
}
