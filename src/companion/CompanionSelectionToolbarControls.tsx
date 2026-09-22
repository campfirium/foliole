import { Highlighter, MessageSquare, MoreHorizontal, RectangleEllipsis, X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName, AppButton, appInputFocusVisibleClassName } from '../shared/ui';

import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';

function ToolbarButton(props: {
  children: JSX.Element;
  label: string;
  onClick: () => void;
  testId?: string;
  disabled?: boolean | undefined;
}) {
  const lastPressActionAtRef = useRef(0);
  function wasRecentlyHandled() {
    return Date.now() - lastPressActionAtRef.current < 350;
  }
  function runAction() {
    if (!props.disabled) props.onClick();
  }
  function runPressAction() {
    if (wasRecentlyHandled()) return;
    lastPressActionAtRef.current = Date.now();
    runAction();
  }
  return (
    <button
      disabled={props.disabled}
      aria-label={props.label}
      className="flex size-9 items-center justify-center rounded-sm text-foreground/72 transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-selection-blue/40"
      data-testid={props.testId}
      onClick={(event) => {
        event.stopPropagation();
        if (wasRecentlyHandled()) return;
        runAction();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button !== 2) runPressAction();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        runPressAction();
      }}
      onTouchEnd={(event) => {
        event.preventDefault();
        event.stopPropagation();
        runPressAction();
      }}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}

export function CompanionSelectionNotePanel(props: {
  draft: string;
  status?: ReactNode;
  disabled?: boolean | undefined;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  top: number;
}) {
  const t = useTranslation();
  return (
    <div className={cn(appFloatingSurfaceClassName('popover'), 'mt-2 w-64 rounded-md p-2')} style={{ left: props.left, position: 'absolute', top: props.top }}>
      {props.status}
      <textarea
        disabled={props.disabled}
        autoFocus
        className={cn(
          'min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-ui-input leading-5 text-foreground placeholder:text-foreground/45',
          appInputFocusVisibleClassName
        )}
        data-testid="companion-selection-note-text"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={t('companion.selection.addAnnotation')}
        value={props.draft}
      />
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('common.cancel')}</AppButton>
        <AppButton data-testid="companion-selection-note-save" disabled={props.disabled || !props.draft.trim()} onClick={props.onSave} size="sm">{t('companion.selection.save')}</AppButton>
      </div>
    </div>
  );
}

export function CompanionSelectionToolbarActions(props: {
  isExistingHighlight: boolean;
  disabled?: boolean | undefined;
  onAddNote: () => void;
  onApply: (kind: CompanionSelectionAnnotationKind) => void;
  onDeleteExistingHighlight: () => void;
}) {
  const t = useTranslation();
  return (
    <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 rounded-md px-1.5 py-1')} role="toolbar">
      {props.isExistingHighlight ? (
        <ToolbarButton disabled={props.disabled} label={t('companion.selection.closeHighlight')} onClick={props.onDeleteExistingHighlight}>
          <X aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      ) : (
        <ToolbarButton disabled={props.disabled} label={t('companion.selection.highlight')} onClick={() => props.onApply('highlight')} testId="companion-selection-highlight">
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      <ToolbarButton disabled={props.disabled} label={t('companion.selection.addComment')} onClick={props.onAddNote} testId="companion-selection-note">
        <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>
      {props.isExistingHighlight ? null : (
        <ToolbarButton disabled={props.disabled} label={t('companion.selection.cloze')} onClick={() => props.onApply('cloze')} testId="companion-selection-cloze">
          <RectangleEllipsis aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      <ToolbarButton disabled={props.disabled} label={t('companion.selection.more')} onClick={() => undefined}>
        <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>
    </div>
  );
}
