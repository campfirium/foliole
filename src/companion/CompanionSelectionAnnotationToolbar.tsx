import { Highlighter, MessageSquare, MoreHorizontal, RectangleEllipsis, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { cn } from '../shared/lib/utils';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';
import { appFloatingSurfaceClassName, AppButton, appInputFocusVisibleClassName } from '../shared/ui';

import type { CompanionExistingHighlightTarget } from './companionExistingHighlightActions';

export type CompanionSelectionAnnotationKind = 'cloze' | 'highlight' | 'note';

export interface CompanionSelectionAnnotationToolbarState {
  existingHighlight?: CompanionExistingHighlightTarget;
  left: number;
  noteLeft: number;
  noteTop: number;
  payload: SelectionCommandPayload | null;
  top: number;
}

function ToolbarButton(props: {
  children: JSX.Element;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  const lastPressActionAtRef = useRef(0);
  function wasRecentlyHandled() {
    return Date.now() - lastPressActionAtRef.current < 350;
  }
  function runAction() {
    props.onClick();
  }
  function runPressAction() {
    if (wasRecentlyHandled()) return;
    lastPressActionAtRef.current = Date.now();
    runAction();
  }
  return (
    <button
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

function CompanionSelectionNotePanel(props: {
  draft: string;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  top: number;
}) {
  const t = useTranslation();
  return (
    <div className={cn(appFloatingSurfaceClassName('popover'), 'mt-2 w-64 rounded-md p-2')} style={{ left: props.left, position: 'absolute', top: props.top }}>
      <textarea
        className={cn(
          'min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-foreground placeholder:text-foreground/45',
          appInputFocusVisibleClassName
        )}
        data-testid="companion-selection-note-text"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={t('companion.selection.addAnnotation')}
        value={props.draft}
      />
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('common.cancel')}</AppButton>
        <AppButton data-testid="companion-selection-note-save" disabled={!props.draft.trim()} onClick={props.onSave} size="sm">{t('companion.selection.save')}</AppButton>
      </div>
    </div>
  );
}

function CompanionSelectionToolbarActions(props: {
  isExistingHighlight: boolean;
  onAddNote: () => void;
  onApply: (kind: CompanionSelectionAnnotationKind) => void;
  onDeleteExistingHighlight: () => void;
}) {
  const t = useTranslation();
  return (
    <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 rounded-md px-1.5 py-1')} role="toolbar">
      {props.isExistingHighlight ? (
        <ToolbarButton label={t('companion.selection.closeHighlight')} onClick={props.onDeleteExistingHighlight}>
          <X aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      ) : (
        <ToolbarButton label={t('companion.selection.highlight')} onClick={() => props.onApply('highlight')} testId="companion-selection-highlight">
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      <ToolbarButton label={t('companion.selection.addComment')} onClick={props.onAddNote} testId="companion-selection-note">
        <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>
      {props.isExistingHighlight ? null : (
        <ToolbarButton label={t('companion.selection.cloze')} onClick={() => props.onApply('cloze')} testId="companion-selection-cloze">
          <RectangleEllipsis aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      <ToolbarButton label={t('companion.selection.more')} onClick={() => undefined}>
        <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>
    </div>
  );
}

interface CompanionSelectionAnnotationToolbarProps {
  onAddExistingHighlightNote: (nodeId: string, originalText: string, note: string) => Promise<void> | void;
  onApply: (kind: CompanionSelectionAnnotationKind, payload: SelectionCommandPayload, note?: string) => Promise<void> | void;
  onClose: () => void;
  onDeleteExistingHighlight: (nodeId: string) => Promise<void> | void;
  resolveSelectionPayload?: () => SelectionCommandPayload | null;
  state: CompanionSelectionAnnotationToolbarState | null;
}

function resolveApplyPayload(props: CompanionSelectionAnnotationToolbarProps) {
  return props.resolveSelectionPayload ? props.resolveSelectionPayload() : props.state?.payload ?? null;
}

function reportAnnotationError(error: unknown) {
  console.error('[companion-selection-toolbar] annotation action failed', error);
}

function useSelectionAnnotationApply(props: CompanionSelectionAnnotationToolbarProps) {
  const applyPendingRef = useRef(false);
  return (kind: CompanionSelectionAnnotationKind, note?: string) => {
    const payload = resolveApplyPayload(props);
    if (!payload || applyPendingRef.current) return;
    applyPendingRef.current = true;
    void Promise.resolve(props.onApply(kind, payload, note))
      .then(() => {
        applyPendingRef.current = false;
        props.onClose();
      })
      .catch((error) => {
        applyPendingRef.current = false;
        reportAnnotationError(error);
      });
  };
}

export function CompanionSelectionAnnotationToolbar(props: CompanionSelectionAnnotationToolbarProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const apply = useSelectionAnnotationApply(props);

  if (!props.state) {
    return null;
  }
  const state = props.state;

  function applyExistingNote(note: string) {
    if (!state.existingHighlight) return;
    const { nodeId, originalText } = state.existingHighlight;
    props.onClose();
    void Promise.resolve(props.onAddExistingHighlightNote(nodeId, originalText, note)).catch(reportAnnotationError);
  }

  function deleteExistingHighlight() {
    const nodeId = state.existingHighlight?.nodeId;
    if (!nodeId) return;
    props.onClose();
    void Promise.resolve(props.onDeleteExistingHighlight(nodeId)).catch(reportAnnotationError);
  }

  const isExistingHighlight = Boolean(state.existingHighlight);
  function openNotePanel() {
    setNoteDraft(state.existingHighlight?.note ?? '');
    setIsNoteOpen(true);
  }

  return (
    <div
      className="fixed z-floating"
      data-companion-selection-toolbar="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: state.left, top: state.top }}
    >
      <CompanionSelectionToolbarActions
        isExistingHighlight={isExistingHighlight}
        onAddNote={openNotePanel}
        onApply={apply}
        onDeleteExistingHighlight={deleteExistingHighlight}
      />
      {isNoteOpen ? (
        <CompanionSelectionNotePanel
          draft={noteDraft}
          left={state.noteLeft - state.left}
          onCancel={() => setIsNoteOpen(false)}
          onChange={setNoteDraft}
          onSave={() => (isExistingHighlight ? applyExistingNote(noteDraft) : apply('note', noteDraft))}
          top={state.noteTop - state.top}
        />
      ) : null}
    </div>
  );
}
