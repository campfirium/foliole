import { RotateCcw } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES, mapSuperMemoPriority } from '../../../../lib/core/import/superMemoPriorityMapping';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppIconButton } from '../../../shared/ui';

type Drag = { index: number; pointer: number; origin: number; value: number };

const arrowSteps: Partial<Record<string, number>> = {
  ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10
};

function clampBoundary(boundaries: readonly number[], index: number, value: number) {
  return Math.min(boundaries[index + 1]!, Math.max(boundaries[index - 1] ?? 0, Math.round(value)));
}

function boundaryLanes(boundaries: readonly number[], active: number) {
  const lanes: number[][] = [[], []];
  const placements = new Map<number, number>();
  const displayed = new Set<number>();
  const order = new Set([active, boundaries.length - 1, ...boundaries.keys()]);
  for (const index of order) {
    const value = boundaries[index]!;
    if (displayed.has(value)) continue;
    const lane = lanes.findIndex(values => values.every(previous => Math.abs(previous - value) >= 5));
    if (lane < 0) continue;
    lanes[lane]!.push(value);
    displayed.add(value);
    placements.set(index, lane);
  }
  return placements;
}

type ScaleProps = {
  boundaries: readonly number[]; disabled: boolean; onChange(value: readonly number[]): void;
};

function usePriorityScale({ boundaries, disabled, onChange }: ScaleProps) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState(1);
  const [dragBoundary, setDragBoundary] = useState<Pick<Drag, 'index' | 'value'>>();
  const values = dragBoundary ? boundaries.map((value, index) => index === dragBoundary.index ? dragBoundary.value : value) : boundaries;
  function changeBoundary(index: number, position: number) {
    const value = clampBoundary(boundaries, index, position);
    if (value !== boundaries[index]) onChange(boundaries.map((end, boundary) => index === boundary ? value : end));
  }

  function startDrag(event: PointerEvent<HTMLSpanElement>, index: number) {
    if (disabled || event.button !== 0 || drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { index, pointer: event.pointerId, origin: event.clientX - bounds.left - bounds.width / 2, value: boundaries[index]! };
    setActive(index);
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer || !track.current) return;
    const box = track.current.getBoundingClientRect();
    current.value = clampBoundary(boundaries, current.index, (event.clientX - current.origin - box.left) * 100 / box.width);
    setDragBoundary({ index: current.index, value: current.value });
  }

  function finishDrag(event: PointerEvent<HTMLSpanElement>, commit: boolean) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointer) return;
    drag.current = null;
    setDragBoundary(undefined);
    if (commit) changeBoundary(current.index, current.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>, index: number) {
    if (disabled || drag.current) return;
    const step = arrowSteps[event.key];
    const value = event.key === 'Home' ? 0 : event.key === 'End' ? 100
      : step === undefined ? undefined : boundaries[index]! + step;
    if (value === undefined) return;
    event.preventDefault();
    setActive(index);
    changeBoundary(index, value);
  }

  return { active, setActive, values, track, startDrag, moveDrag, finishDrag, onKeyDown };
}

export function SuperMemoPriorityScale(props: ScaleProps) {
  const { disabled, onChange } = props;
  const { active, setActive, values, track, startDrag, moveDrag, finishDrag, onKeyDown } = usePriorityScale(props);
  const activeTier = mapSuperMemoPriority(values[active], values);
  const placements = boundaryLanes(values, active);
  const t = useTranslation();
  const label = t('desktop.superMemoDrafts.priorityScale');
  const reset = t('desktop.superMemoDrafts.priorityReset');
  return <>
    <div className="flex items-center justify-between text-xs text-foreground/75">
      <span>{label}</span>
      <AppIconButton label={reset} title={reset} disabled={disabled}
        icon={<RotateCcw aria-hidden="true" className="size-4" />}
        onClick={() => { setActive(1); onChange(DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES); }} />
    </div>
    <div className="px-2">
      <div ref={track} role="group" aria-label={label}
        className="relative h-[76px] select-none text-xs tabular-nums aria-disabled:opacity-50" aria-disabled={disabled}>
        <span aria-hidden="true" className="absolute inset-x-0 top-[35px] h-2 rounded bg-settings-divider/60" />
        {values.map((end, index) => {
          const start = values[index - 1] ?? 0;
          return <span key={index} aria-hidden="true" className={`absolute top-[35px] h-2 text-center ${index === activeTier ? 'bg-[var(--role-accent)]' : 'bg-[var(--role-accent)]/25 even:bg-[var(--role-accent)]/35'}`}
            style={{ left: `${start}%`, width: `${end - start}%` }}>
            {end - start >= 5 ? <span className="absolute inset-x-0 top-4 font-semibold text-foreground/75">P{index}</span> : null}
          </span>;
        })}
        {values.map((value, index) => {
          const lane = placements.get(index);
          return lane === undefined ? null : <span key={index} aria-hidden="true"
            className={`pointer-events-none absolute whitespace-nowrap ${lane ? 'top-0' : 'top-3.5'} ${value === 100 ? '-ml-1 -translate-x-full' : 'ml-1.5'} ${index === active ? 'font-semibold text-foreground' : 'text-foreground/70'}`}
            style={{ left: `${value}%` }}>{value}</span>;
        })}
        {values.slice(0, -1).map((value, index) => <span key={index} role="slider" aria-disabled={disabled}
          aria-label={t('desktop.superMemoDrafts.priorityBoundary', { left: index, right: index + 1 })}
          aria-valuemin={values[index - 1] ?? 0} aria-valuemax={values[index + 1]} aria-valuenow={value} aria-valuetext={`${value}%`}
          tabIndex={disabled ? -1 : 0} style={{ left: `${value}%` }}
          className={`group absolute top-6 grid h-8 w-5 -translate-x-1/2 touch-none place-items-center outline-none ${disabled ? '' : 'cursor-ew-resize'} ${index === active ? 'z-local-overlay' : 'z-local-raised'}`}
          onFocus={() => setActive(index)} onKeyDown={event => onKeyDown(event, index)}
          onPointerDown={event => startDrag(event, index)} onPointerMove={moveDrag}
          onPointerUp={event => finishDrag(event, true)} onPointerCancel={event => finishDrag(event, false)}
          onLostPointerCapture={event => finishDrag(event, false)}>
          <span aria-hidden="true" className={`pointer-events-none block rounded-full ring-2 ring-settings-group group-focus-visible:ring-[var(--role-accent)] ${index === active ? 'h-6 w-1 bg-[var(--role-accent)]' : 'h-4 w-0.5 bg-foreground/50'}`} />
          {index === 0 && value === 0 ? <span aria-hidden="true" className="pointer-events-none absolute top-7 font-semibold text-foreground/75">P0</span> : null}
        </span>)}
      </div>
    </div>
  </>;
}
