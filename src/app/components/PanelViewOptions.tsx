import { Settings2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { onWindowPriorityEscape } from '../../shared/platform/keyboard';
import { AppIconButton, AppTooltip, AppTooltipContent, AppTooltipTrigger, appFloatingSurfaceClassName } from '../../shared/ui';

export function PanelViewOptions({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false);
    };
    const unlisten = onWindowPriorityEscape(() => {
      setOpen(false);
      trigger.current?.focus();
    });
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      unlisten();
      document.removeEventListener('pointerdown', dismissOutside);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={anchor}>
      <AppTooltip>
        <AppTooltipTrigger asChild>
          <AppIconButton aria-controls={open ? id : undefined} aria-expanded={open}
            className="size-[30px] aria-expanded:bg-[var(--app-floating-item-hover-bg)]"
            icon={<Settings2 aria-hidden="true" className="size-4" />} label={label}
            onClick={() => setOpen(value => !value)} ref={trigger} />
        </AppTooltipTrigger>
        {!open && <AppTooltipContent>{label}</AppTooltipContent>}
      </AppTooltip>
      {open && <div aria-label={label} className={appFloatingSurfaceClassName('popover', 'absolute end-0 top-full z-20 mt-1 w-max space-y-3 p-3')}
        id={id} role="group">{children}</div>}
    </div>
  );
}
