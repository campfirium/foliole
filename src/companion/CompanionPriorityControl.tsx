import { useEffect, useRef, type CSSProperties } from 'react';

import '../features/nodes/components/desktopPrioritySlider.css';
import { useTranslation } from '../shared/localization/LocalizationProvider';

function position(value: number) {
  return `calc(${value / 9 * 100}% + ${8 - value / 9 * 16}px)`;
}

interface CompanionPriorityControlProps {
  disabled: boolean;
  enforced?: { value: number; owner: string } | undefined;
  ownPriority: number | null;
  onCommit(value: number): void;
  value: number;
}

export function CompanionPriorityControl({ disabled, enforced, ownPriority, onCommit, value }: CompanionPriorityControlProps) {
  const t = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLOutputElement>(null);
  const absent = Boolean(enforced && ownPriority == null);
  const label = t('desktop.nodeReview.priority');

  useEffect(() => {
    const slider = input.current;
    if (!slider || disabled) return;
    slider.value = String(value);
    showValue(slider, value, absent);
  }, [value, absent, disabled]);

  useEffect(() => {
    const slider = input.current;
    if (!slider) return;
    // Native change saves on release. Input events only update the preview.
    const save = () => {
      const next = slider.valueAsNumber;
      if (disabled || next === value) return;
      showValue(slider, next);
      onCommit(next);
    };
    slider.addEventListener('change', save);
    return () => slider.removeEventListener('change', save);
  }, [value, disabled, onCommit]);

  function showValue(slider: HTMLInputElement, next: number, hideThumb = false) {
    const text = hideThumb ? '—' : `P${next}`;
    slider.style.setProperty('--priority-position', position(next));
    slider.style.setProperty('--priority-thumb', hideThumb ? 'transparent' : 'var(--priority-fill)');
    slider.setAttribute('aria-valuetext', text);
    if (readout.current) readout.current.textContent = text;
  }

  return <section aria-label={label} className="border-b border-companion-divider py-3">
    <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
      <span>{label}</span>
      <output aria-hidden="true" ref={readout} className={`tabular-nums ${enforced ? 'text-foreground/44' : 'text-companion-text-secondary'}`}>
        {absent ? '—' : `P${value}`}
      </output>
    </div>
    <div className="relative mx-1 mt-1 [--priority-interactive:var(--companion-accent)]">
      <input aria-label={label} aria-valuetext={absent ? '—' : `P${value}`} ref={input}
        className="desktop-priority-range" data-companion="" data-enforced={Boolean(enforced)}
        style={{ '--priority-position': position(value), '--priority-thumb': absent ? 'transparent' : 'var(--priority-fill)' } as CSSProperties}
        defaultValue={value} disabled={disabled} min={0} max={9} step={1} type="range"
        onInput={event => showValue(event.currentTarget, event.currentTarget.valueAsNumber)}
        onPointerCancel={event => {
          event.currentTarget.value = String(value);
          showValue(event.currentTarget, value, absent);
        }} />
      {enforced && <span role="img" aria-label={t('desktop.nodeReview.priority.activeValue', { value: `P${enforced.value}` })}
        className="pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground"
        style={{ left: position(enforced.value) }} />}
    </div>
    {enforced && <p className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 text-xs text-companion-text-secondary">
      <span>{t('companion.reviewOptions.enforcedInheritance')}</span>
      <span className="text-end [overflow-wrap:anywhere]">{enforced.owner}</span>
    </p>}
  </section>;
}
