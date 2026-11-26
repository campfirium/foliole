import './desktopPrioritySlider.css';

import { useState, type CSSProperties } from 'react';

import { normalizePushQueuePriority } from '../../review/model/unifiedPushQueueRules';

import { PrioritySourceTooltip } from './PrioritySourceTooltip';

import { useTranslation } from '@/shared/localization/LocalizationProvider';

export interface EnforcedPriorityDisplay {
  value: number;
  owner?: string;
}

interface DesktopPrioritySliderProps {
  ariaLabel: string;
  enforced?: EnforcedPriorityDisplay | undefined;
  onChange: (priority: number) => void;
  value: number;
}

function position(value: number) {
  const ratio = normalizePushQueuePriority(value) / 9;
  return `calc(${ratio * 100}% + ${8 - 16 * ratio}px)`;
}

export function DesktopPrioritySlider({ ariaLabel, enforced, onChange, value }: DesktopPrioritySliderProps) {
  const t = useTranslation();
  const [overRing, setOverRing] = useState(false);
  const priority = normalizePushQueuePriority(value);
  const activePosition = enforced ? position(enforced.value) : undefined;
  const sliderStyle = { '--priority-position': position(priority) } as CSSProperties;
  const activeValue = enforced ? `P${enforced.value}` : '';

  return (
    <div className="relative min-w-0" onPointerLeave={() => setOverRing(false)}
      onPointerMove={enforced ? (event) => {
        const ring = event.currentTarget.querySelector('[data-priority-ring]')?.getBoundingClientRect();
        setOverRing(Boolean(ring && event.pointerType !== 'touch' && !event.buttons
          && Math.hypot(event.clientX - ring.left - ring.width / 2, event.clientY - ring.top - ring.height / 2) <= 24));
      } : undefined}>
      <input aria-label={ariaLabel} aria-valuetext={`P${priority}`} className="desktop-priority-range"
        data-enforced={Boolean(enforced)} max={9} min={0} step={1} type="range" value={priority}
        onChange={(event) => onChange(Number(event.currentTarget.value))} style={sliderStyle} />
      {enforced && (
        <div className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          data-priority-ring="" style={{ left: activePosition }}>
          <PrioritySourceTooltip
            accessibleLabel={t('desktop.nodeReview.priority.activeValue', { value: activeValue })}
            className="desktop-priority-ring" hoverFromSlider={overRing}
            source={<>
              <div className="font-semibold">{t('desktop.nodeReview.priority.activeValue', { value: activeValue })}</div>
              {enforced.owner && t('desktop.nodeReview.priority.forcedSource', { owner: enforced.owner })}
            </>}>
            <span aria-hidden="true" className="block size-7 rounded-full border-2 border-foreground" />
          </PrioritySourceTooltip>
        </div>
      )}
    </div>
  );
}
