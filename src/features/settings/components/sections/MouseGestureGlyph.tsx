import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus } from 'lucide-react';

import type { EditorMouseGestureDirection } from '../../../editor/model/editorMouseGestures';

import { cn } from '@/shared/lib/utils';

const ICONS = { down: ArrowDown, left: ArrowLeft, right: ArrowRight, up: ArrowUp };

export function MouseGestureGlyph(props: {
  add?: boolean;
  className?: string;
  directions?: EditorMouseGestureDirection[];
  label: string;
}) {
  return (
    <span
      aria-label={props.label}
      className={cn(
        'inline-flex h-9 min-w-20 items-center justify-center gap-1 rounded-md border bg-settings-control px-2 text-foreground',
        props.add ? 'border-dashed border-settings-control-border-hover' : 'border-transparent',
        props.className
      )}
      role="img"
    >
      {props.add ? (
        <Plus aria-hidden="true" size={17} />
      ) : (
        props.directions?.map((direction, index) => {
          const Icon = ICONS[direction];
          return <Icon aria-hidden="true" key={`${direction}-${index}`} size={16} />;
        })
      )}
    </span>
  );
}
