import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { ImageClozeDraftRegion, ImageClozeLocator } from '../model/imageCloze';

interface ImageClozeRegionSurfaceProps {
  canDraw?: boolean;
  hiddenRegionIds?: string[];
  imageAlt: string;
  imageSrc: string;
  onCreateRegion?: (region: Omit<ImageClozeLocator, 'attachmentId'>) => void;
  outlinedRegionIds?: string[];
  regions: Array<Pick<ImageClozeDraftRegion, 'height' | 'id' | 'width' | 'x' | 'y'> | ImageClozeLocator>;
}

interface DragRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toPercentValue(value: number) {
  return `${value * 100}%`;
}

function normalizeDragRect(startX: number, startY: number, endX: number, endY: number): DragRect {
  return {
    height: Math.abs(endY - startY),
    width: Math.abs(endX - startX),
    x: Math.min(startX, endX),
    y: Math.min(startY, endY)
  };
}

function mapPointerToRatio(event: ReactPointerEvent<HTMLDivElement>, element: HTMLDivElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: clampRatio((event.clientX - rect.left) / rect.width),
    y: clampRatio((event.clientY - rect.top) / rect.height)
  };
}

function createRegionKey(region: ImageClozeRegionSurfaceProps['regions'][number]) {
  return 'id' in region ? region.id : `${region.x}-${region.y}-${region.width}-${region.height}`;
}

function renderSavedRegions(
  regions: ImageClozeRegionSurfaceProps['regions'],
  hiddenRegionIdSet: Set<string>,
  outlinedRegionIdSet: Set<string>
) {
  return regions.map((region) => {
    const regionId = 'id' in region ? region.id : '';
    const isHidden = hiddenRegionIdSet.has(regionId);
    const isOutlined = outlinedRegionIdSet.has(regionId);
    const regionClassName = isHidden
      ? 'border-foreground bg-foreground/85'
      : isOutlined
        ? 'border-dashed border-accent-primary/90 bg-transparent'
        : 'border-accent-primary/80 bg-accent-primary/10';
    return (
      <div
        className={`absolute rounded border-2 ${regionClassName}`}
        key={createRegionKey(region)}
        style={{
          height: toPercentValue(region.height),
          left: toPercentValue(region.x),
          top: toPercentValue(region.y),
          width: toPercentValue(region.width)
        }}
      />
    );
  });
}

function renderDraftRegion(draftRect: DragRect | null) {
  if (!draftRect) {
    return null;
  }

  return (
    <div
      className="absolute rounded border-2 border-dashed border-accent-primary bg-accent-primary/15"
      style={{
        height: toPercentValue(draftRect.height),
        left: toPercentValue(draftRect.x),
        top: toPercentValue(draftRect.y),
        width: toPercentValue(draftRect.width)
      }}
    />
  );
}

function useImageClozeDraft(onCreateRegion?: (region: Omit<ImageClozeLocator, 'attachmentId'>) => void) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<DragRect | null>(null);

  const resetDraft = () => {
    setDragStart(null);
    setDraftRect(null);
  };

  const finalizeDraft = () => {
    if (!draftRect || !onCreateRegion || draftRect.width < 0.01 || draftRect.height < 0.01) {
      resetDraft();
      return;
    }
    onCreateRegion(draftRect);
    resetDraft();
  };

  return {
    draftRect,
    handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, canDraw: boolean) {
      if (!canDraw || !overlayRef.current) {
        return;
      }
      const point = mapPointerToRatio(event, overlayRef.current);
      if (!point) {
        return;
      }
      event.preventDefault();
      overlayRef.current.setPointerCapture(event.pointerId);
      setDragStart(point);
      setDraftRect({ height: 0, width: 0, x: point.x, y: point.y });
    },
    handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      if (!dragStart || !overlayRef.current) {
        return;
      }
      const point = mapPointerToRatio(event, overlayRef.current);
      if (!point) {
        return;
      }
      setDraftRect(normalizeDragRect(dragStart.x, dragStart.y, point.x, point.y));
    },
    handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      if (overlayRef.current?.hasPointerCapture(event.pointerId)) {
        overlayRef.current.releasePointerCapture(event.pointerId);
      }
      finalizeDraft();
    },
    overlayRef
  };
}

export function ImageClozeRegionSurface({
  canDraw = false,
  hiddenRegionIds = [],
  imageAlt,
  imageSrc,
  onCreateRegion,
  outlinedRegionIds = [],
  regions
}: ImageClozeRegionSurfaceProps) {
  const { draftRect, handlePointerDown, handlePointerMove, handlePointerUp, overlayRef } =
    useImageClozeDraft(onCreateRegion);
  const hiddenRegionIdSet = useMemo(() => new Set(hiddenRegionIds), [hiddenRegionIds]);
  const outlinedRegionIdSet = useMemo(() => new Set(outlinedRegionIds), [outlinedRegionIds]);

  return (
    <div className="relative flex min-h-0 min-w-0 items-center justify-center overflow-auto rounded-lg border border-border bg-bg-panel">
      <div className="relative max-h-full max-w-full">
        <img alt={imageAlt} className="block max-h-[70dvh] max-w-full select-none object-contain" draggable={false} src={imageSrc} />
        <div
          className={`absolute inset-0 ${canDraw ? 'cursor-crosshair' : ''}`}
          onPointerDown={(event) => handlePointerDown(event, canDraw)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          ref={overlayRef}
        >
          {renderSavedRegions(regions, hiddenRegionIdSet, outlinedRegionIdSet)}
          {renderDraftRegion(draftRect)}
        </div>
      </div>
    </div>
  );
}
