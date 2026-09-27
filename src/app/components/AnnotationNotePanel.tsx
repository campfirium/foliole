import { Pin, PinOff } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, appFloatingSurfaceClassName, appInputFocusVisibleClassName } from '../../shared/ui';
import { useDismissibleSurface } from '../../shared/ui/useDismissibleSurface';

import { useAnnotationNotePanelPlacement } from './useAnnotationNotePanelPlacement';

function FollowSelectionButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={props.label}
      className="group/pin flex h-5 w-5 items-center justify-center rounded text-foreground/35 hover:text-foreground/65 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

function PanelDragHeader(props: { pinned: boolean; label: string; onFollow: () => void; onDrag: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <div className="flex h-5 shrink-0 cursor-move items-center justify-end touch-none" onPointerDown={props.onDrag}>
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

  return (
    <div
      className={cn(appFloatingSurfaceClassName('popover'), 'fixed z-floating flex flex-col p-2')}
      data-annotation-toolbar="true"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <PanelDragHeader
        label={t('desktop.annotation.followSelection')}
        onDrag={(event) => beginPointerInteraction('drag', event)}
        onFollow={followSelection}
        pinned={pinned}
      />
      <textarea
        autoFocus
        className={cn(
          'min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-foreground placeholder:text-foreground/45',
          appInputFocusVisibleClassName
        )}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={t('desktop.annotation.comment.placeholder')}
        value={props.draft}
      />
      {props.error ? <p className="px-1 text-xs text-destructive" role="alert">{props.error}</p> : null}
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('desktop.annotation.cancel')}</AppButton>
        <AppButton disabled={!props.draft.trim() || props.saving} onClick={props.onSave} size="sm">{t('desktop.annotation.save')}</AppButton>
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
