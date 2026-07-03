import { Highlighter, MessageSquare, MoreHorizontal, RectangleEllipsis, X } from 'lucide-react';
import { useState } from 'react';

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
}) {
  return (
    <button
      aria-label={props.label}
      className="flex size-9 items-center justify-center rounded-sm text-foreground/72 transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-selection-blue/40"
      onClick={props.onClick}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
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
        autoFocus
        className={cn(
          'min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-foreground placeholder:text-foreground/45',
          appInputFocusVisibleClassName
        )}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={t('companion.selection.addAnnotation')}
        value={props.draft}
      />
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">{t('common.cancel')}</AppButton>
        <AppButton disabled={!props.draft.trim()} onClick={props.onSave} size="sm">{t('companion.selection.save')}</AppButton>
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
        <ToolbarButton label={t('companion.selection.highlight')} onClick={() => props.onApply('highlight')}>
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </ToolbarButton>
      )}
      <ToolbarButton label={t('companion.selection.addComment')} onClick={props.onAddNote}>
        <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
      </ToolbarButton>
      {props.isExistingHighlight ? null : (
        <ToolbarButton label={t('companion.selection.cloze')} onClick={() => props.onApply('cloze')}>
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
  const currentPayload = props.resolveSelectionPayload?.() ?? null;
  const cachedPayload = props.state?.payload ?? null;
  if (!currentPayload) return cachedPayload;
  if (!cachedPayload) return currentPayload;
  return currentPayload.selectionText.length >= cachedPayload.selectionText.length ? currentPayload : cachedPayload;
}

export function CompanionSelectionAnnotationToolbar(props: CompanionSelectionAnnotationToolbarProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);

  if (!props.state) {
    return null;
  }

  function apply(kind: CompanionSelectionAnnotationKind, note?: string) {
    const payload = resolveApplyPayload(props);
    if (!payload) return;
    props.onClose();
    void Promise.resolve(props.onApply(kind, payload, note)).catch(() => undefined);
  }

  function applyExistingNote(note: string) {
    if (!props.state?.existingHighlight) return;
    const { nodeId, originalText } = props.state.existingHighlight;
    props.onClose();
    void Promise.resolve(props.onAddExistingHighlightNote(nodeId, originalText, note)).catch(() => undefined);
  }

  function deleteExistingHighlight() {
    const nodeId = props.state?.existingHighlight?.nodeId;
    if (!nodeId) return;
    props.onClose();
    void Promise.resolve(props.onDeleteExistingHighlight(nodeId)).catch(() => undefined);
  }

  const isExistingHighlight = Boolean(props.state.existingHighlight);

  return (
    <div
      className="fixed z-floating"
      data-companion-selection-toolbar="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: props.state.left, top: props.state.top }}
    >
      <CompanionSelectionToolbarActions
        isExistingHighlight={isExistingHighlight}
        onAddNote={() => setIsNoteOpen(true)}
        onApply={apply}
        onDeleteExistingHighlight={deleteExistingHighlight}
      />
      {isNoteOpen ? (
        <CompanionSelectionNotePanel
          draft={noteDraft}
          left={props.state.noteLeft - props.state.left}
          onCancel={() => setIsNoteOpen(false)}
          onChange={setNoteDraft}
          onSave={() => (isExistingHighlight ? applyExistingNote(noteDraft) : apply('note', noteDraft))}
          top={props.state.noteTop - props.state.top}
        />
      ) : null}
    </div>
  );
}
