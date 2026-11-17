import { Check, Minus, Plus, Settings2 } from 'lucide-react';
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
      {open && <div aria-label={label} className={appFloatingSurfaceClassName('popover', 'absolute end-0 top-full z-surface-overlay mt-1 w-max space-y-3 p-3')}
        id={id} role="group">{children}</div>}
    </div>
  );
}

export function PanelViewChoiceGroup<T extends string | number>({ label, choices, value, onChange }: {
  label: string;
  choices: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-foreground/75">{label}</legend>
      <div className="grid w-full auto-cols-fr grid-flow-col gap-0.5 rounded-lg border border-[var(--app-floating-divider-color)] bg-[var(--app-surface-control-bg)] p-0.5">
        {choices.map(choice => (
          <ViewChoice checked={value === choice.value} key={choice.value} label={choice.label} name={id}
            onSelect={() => onChange(choice.value)} />
        ))}
      </div>
    </fieldset>
  );
}

function ViewChoice({ checked, name, label, onSelect }: {
  checked: boolean;
  name: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label className="relative min-w-0 cursor-pointer">
      <input checked={checked} className="app-focus-peer peer sr-only" name={name} onChange={onSelect} type="radio" />
      <span className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-ui-base text-foreground/75 transition-colors hover:bg-[var(--app-control-bg-hover-color)] peer-checked:border-[var(--app-control-border-color)] peer-checked:bg-[var(--app-floating-item-active-bg)] peer-checked:font-medium peer-checked:text-foreground">
        <Check aria-hidden="true" className={`size-3.5 shrink-0 ${checked ? '' : 'invisible'}`} />
        <span>{label}</span>
      </span>
    </label>
  );
}

export function PanelViewStepper(props: {
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={props.label}>
      <span className="text-xs font-medium text-foreground/75">{props.label}</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--app-floating-divider-color)] bg-[var(--app-surface-control-bg)] p-0.5">
        <AppIconButton className="size-7" disabled={props.value <= props.min}
          icon={<Minus aria-hidden="true" className="size-4" />} label={props.decreaseLabel}
          onClick={() => props.onChange(props.value - 1)} />
        <output className="w-6 text-center text-ui-base tabular-nums text-foreground">{props.value}</output>
        <AppIconButton className="size-7" disabled={props.value >= props.max}
          icon={<Plus aria-hidden="true" className="size-4" />} label={props.increaseLabel}
          onClick={() => props.onChange(props.value + 1)} />
      </div>
    </div>
  );
}
