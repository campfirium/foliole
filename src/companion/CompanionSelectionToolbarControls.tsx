import { CornerDownRight, Highlighter, MessageSquare, MoreHorizontal, RectangleEllipsis, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName, AppButton, appInputFocusVisibleClassName } from '../shared/ui';

import { suppressCompanionPressClick } from './companionPressClickSuppression';
import type { CompanionSelectionAnnotationKind } from './CompanionSelectionAnnotationToolbar';
import { CompanionSelectionCopyMenu } from './CompanionSelectionCopyMenu';

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
  function runPressAction(ownerDocument: Document) {
    if (wasRecentlyHandled()) return;
    lastPressActionAtRef.current = Date.now();
    suppressCompanionPressClick(ownerDocument);
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
        if (event.button !== 2) runPressAction(event.currentTarget.ownerDocument);
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        runPressAction(event.currentTarget.ownerDocument);
      }}
      onTouchEnd={(event) => {
        event.preventDefault();
        event.stopPropagation();
        runPressAction(event.currentTarget.ownerDocument);
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
  isCloze?: boolean;
  disabled?: boolean | undefined;
  getCopyText?: () => string;
  onCopied?: () => void;
  onAddNote: () => void;
  onApply: (kind: CompanionSelectionAnnotationKind) => void;
  onDeleteExistingHighlight: () => void;
  onOpenExistingHighlight?: (() => void) | undefined;
}) {
  const t = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [copyMenu, setCopyMenu] = useState<{ left: number; top: number; text: string } | null>(null);
  function toggleCopyMenu() {
    if (copyMenu) { setCopyMenu(null); return; }
    const rect = toolbarRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCopyMenu({
      left: Math.max(8, Math.min(rect.right - 188, window.innerWidth - 196)),
      top: rect.bottom + 100 < window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - 100),
      text: props.getCopyText?.() ?? ''
    });
  }
  return (
    <div ref={toolbarRef} className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 rounded-md px-1.5 py-1')} role="toolbar">
      {props.isExistingHighlight ? (
        <ToolbarButton disabled={props.disabled} label={t(props.isCloze ? 'companion.selection.deleteCloze' : 'companion.selection.closeHighlight')} onClick={props.onDeleteExistingHighlight}>
          <X aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      ) : (
        <ToolbarButton disabled={props.disabled} label={t('companion.selection.highlight')} onClick={() => props.onApply('highlight')} testId="companion-selection-highlight">
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      {props.isCloze ? null : <ToolbarButton disabled={props.disabled} label={t('companion.selection.addComment')} onClick={() => { setCopyMenu(null); props.onAddNote(); }} testId="companion-selection-note">
        <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>}
      {props.isExistingHighlight ? null : (
        <ToolbarButton disabled={props.disabled} label={t('companion.selection.cloze')} onClick={() => props.onApply('cloze')} testId="companion-selection-cloze">
          <RectangleEllipsis aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      {props.isExistingHighlight && props.onOpenExistingHighlight ? <ToolbarButton disabled={props.disabled} label={t('desktop.highlightToolbar.open')} onClick={props.onOpenExistingHighlight}>
        <CornerDownRight aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton> : null}
      <ToolbarButton disabled={props.disabled} label={t('companion.selection.more')} onClick={toggleCopyMenu}>
        <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>
      {copyMenu ? <CompanionSelectionCopyMenu {...copyMenu} onCopied={() => { setCopyMenu(null); props.onCopied?.(); }} /> : null}
    </div>
  );
}
