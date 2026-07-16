import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useDisplayScale } from '../../features/settings/context/DisplayScaleProvider';
import type { ContentRegionScaleId } from '../../features/settings/model/displayScaleSettings';
import { cn } from '../lib/utils';

export function ScalableContentRegion(props: {
  children: ReactNode;
  className?: string;
  label: string;
  regionId: ContentRegionScaleId;
}) {
  const displayScale = useDisplayScale();
  const percent = displayScale.getContentRegionScale(props.regionId);
  const [showFeedback, setShowFeedback] = useState(false);
  const previousPercent = useRef(percent);

  useEffect(() => {
    if (previousPercent.current === percent) return;
    previousPercent.current = percent;
    setShowFeedback(true);
    const timer = window.setTimeout(() => setShowFeedback(false), 900);
    return () => window.clearTimeout(timer);
  }, [percent]);

  const focusRegion = () => displayScale.focusContentRegion(props.regionId);
  const scale = percent / 100;
  return (
    <div
      className={cn('relative min-h-0 min-w-0 overflow-hidden', props.className)}
      data-content-scale-region={props.regionId}
      onFocusCapture={focusRegion}
      onPointerDownCapture={focusRegion}
    >
      <div
        className="flex min-h-0 min-w-0 origin-top-left"
        style={{ height: '100%', width: '100%', zoom: scale }}
      >
        {props.children}
      </div>
      {showFeedback ? (
        <div
          aria-live="polite"
          className="pointer-events-none absolute right-3 top-3 z-50 rounded-md bg-foreground/85 px-2.5 py-1 text-xs text-background shadow-md"
        >
          {props.label} · {percent}%
        </div>
      ) : null}
    </div>
  );
}
