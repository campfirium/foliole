import { GripVertical, Pin, PinOff } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, appFloatingSurfaceClassName, appFocusSilentClassName } from '../../shared/ui';
import { useDismissibleSurface } from '../../shared/ui/useDismissibleSurface';

import { useAnnotationNotePanelPlacement } from './useAnnotationNotePanelPlacement';

function FollowSelectionButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={props.label}
      className="group/pin flex h-5 w-5 items-center justify-center rounded-md text-foreground/35 hover:bg-[var(--app-floating-item-hover-bg)] hover:text-foreground/65 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={props.onClick}
      onPointerDown={(event) => event.stopPropagation()}
      title={props.label}
      type="button"
    >
      <Pin aria-hidden="true" className="h-3.5 w-3.5 group-hover/pin:hidden group-focus-visible/pin:hidden" strokeWidth={1.5} />
      <PinOff aria-hidden="true" className="hidden h-3.5 w-3.5 group-hover/pin:block group-focus-visible/pin:block" strokeWidth={1.5} />
    </button>
  );
}

function PanelDragHeader(props: { pinned: boolean; label: string; title: string; onFollow: () => void; onDrag: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <div className="flex h-9 shrink-0 cursor-move items-center gap-1.5 border-b border-[var(--app-floating-divider-color)] px-2 text-ui-sm text-foreground/70 touch-none" onPointerDown={props.onDrag}>
      <GripVertical aria-hidden="true" className="h-4 w-3 text-foreground/35" strokeWidth={1.5} />
      <span className="select-none">{props.title}</span>
      <span className="flex-1" />
      {props.pinned ? <FollowSelectionButton label={props.label} onClick={props.onFollow} /> : null}
    </div>
  );
}

export function AnnotationNotePanel(props: {
  draft: string;
  error?: string | null;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  top: number;
}) {
  const t = useTranslation();
  useDismissibleSurface({ onDismiss: props.onCancel });
  const { rect, pinned, followSelection, beginPointerInteraction } = useAnnotationNotePanelPlacement(props.left, props.top);
  const title = t('desktop.annotation.title');

  return (
    <div
      aria-label={title}
      className={cn(appFloatingSurfaceClassName('popover'), 'fixed z-floating flex flex-col overflow-hidden p-0')}
      data-annotation-toolbar="true"
      role="dialog"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <PanelDragHeader
        label={t('desktop.annotation.followSelection')}
        onDrag={(event) => beginPointerInteraction('drag', event)}
        onFollow={followSelection}
        pinned={pinned}
        title={title}
      />
      <textarea
        autoFocus
        className={cn(
          'min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-3.5 py-3 text-ui-md text-foreground placeholder:text-foreground/45',
          appFocusSilentClassName
        )}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={t('desktop.annotation.comment.placeholder')}
        value={props.draft}
      />
      {props.error ? <p className="px-3.5 text-ui-sm text-destructive" role="alert">{props.error}</p> : null}
      <div className="flex h-11 shrink-0 items-center justify-end gap-1.5 px-2.5 pb-1.5">
        <AppButton className="min-h-7 px-2.5 text-ui-base" onClick={props.onCancel} size="sm" variant="ghost">{t('desktop.annotation.cancel')}</AppButton>
        <AppButton className="min-h-7 px-2.5 text-ui-base" disabled={!props.draft.trim() || props.saving} onClick={props.onSave} size="sm">{t('desktop.annotation.save')}</AppButton>
      </div>
      <div
        aria-label={t('desktop.annotation.resize')}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
        onPointerDown={(event) => beginPointerInteraction('resize', event)}
        role="separator"
      />
    </div>
  );
}
