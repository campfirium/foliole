import { useEffect, useState, type ReactNode } from 'react';

import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/shared/ui';

interface PrioritySourceTooltipProps {
  accessibleLabel: string;
  children: ReactNode;
  className?: string;
  hoverFromSlider?: boolean;
  source: ReactNode | ((dismiss: () => void) => ReactNode);
}

export function PrioritySourceTooltip({
  accessibleLabel, children, className, hoverFromSlider = false, source
}: PrioritySourceTooltipProps) {
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = triggerOpen || sliderOpen || pinned;

  useEffect(() => {
    const timer = window.setTimeout(() => setSliderOpen(hoverFromSlider), hoverFromSlider ? 100 : 160);
    return () => window.clearTimeout(timer);
  }, [hoverFromSlider]);

  function close() {
    setTriggerOpen(false);
    setSliderOpen(false);
    setPinned(false);
  }

  return (
    <AppTooltip delayDuration={100} open={open} onOpenChange={setTriggerOpen}>
      <AppTooltipTrigger asChild>
        <button aria-expanded={open} aria-label={accessibleLabel} className={className} onClick={() => {
          if (pinned) close();
          else setPinned(true);
        }} type="button">
          {children}
        </button>
      </AppTooltipTrigger>
      <AppTooltipContent arrow className="[overflow-wrap:anywhere]" side="top"
        onEscapeKeyDown={close} onPointerDownOutside={close}
        style={{ zIndex: 'calc(var(--z-modal) + 1)' }}>
        {typeof source === 'function' ? source(close) : source}
      </AppTooltipContent>
    </AppTooltip>
  );
}
