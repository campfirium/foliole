import { Highlighter, RectangleEllipsis, X } from 'lucide-react';

import { cn } from '../../shared/lib/utils';
import { AppButton, AppIconButton, appFloatingSurfaceClassName } from '../../shared/ui';

export function ClozeGuardPanel(props: {
  left: number;
  onCancel: () => void;
  onCreateCloze: () => void;
  onCreateHighlight: () => void;
  top: number;
}) {
  return (
    <div
      className={cn(appFloatingSurfaceClassName('popover'), 'fixed z-50 w-[19rem] overflow-hidden rounded-lg')}
      data-annotation-toolbar="true"
      style={{ left: props.left, top: props.top }}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--app-floating-muted-bg)] text-foreground/70">
          <RectangleEllipsis aria-hidden="true" size={16} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-5 text-foreground">Create a long cloze?</div>
          <p className="mt-0.5 text-[12px] leading-5 text-foreground/64">
            The selected answer is small, but the card front would include most of this topic.
          </p>
        </div>
        <AppIconButton
          className="-mr-1 -mt-1 size-7 rounded-sm"
          icon={<X aria-hidden="true" size={15} strokeWidth={2} />}
          label="Cancel"
          onClick={props.onCancel}
        />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-[var(--app-floating-divider-color)] bg-[var(--app-floating-muted-bg)] px-2.5 py-2">
        <AppButton className="justify-center" onClick={props.onCreateHighlight} size="sm">
          <Highlighter aria-hidden="true" size={15} strokeWidth={2} />
          Create highlight
        </AppButton>
        <AppButton className="px-2.5" onClick={props.onCreateCloze} size="sm" variant="ghost">
          Keep cloze
        </AppButton>
      </div>
    </div>
  );
}
