import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionHighlightRead, CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';
import { AppButton, appFloatingSurfaceClassName } from '../shared/ui';

import type { CompanionExistingHighlightTarget } from './companionExistingHighlightActions';
import { CompanionSelectionNotePanel, CompanionSelectionToolbarActions } from './CompanionSelectionToolbarControls';
import { useCompanionHighlightSession } from './useCompanionHighlightSession';
import { useCompanionSelectionApply } from './useCompanionSelectionApply';

export type CompanionSelectionAnnotationKind = 'cloze' | 'highlight' | 'note';

export interface CompanionSelectionAnnotationToolbarState {
  existingHighlight?: CompanionExistingHighlightTarget;
  left: number;
  noteLeft: number;
  noteTop: number;
  payload: SelectionCommandPayload | null;
  top: number;
}

interface CompanionSelectionAnnotationToolbarProps {
  onAddExistingHighlightNote: (nodeId: string, originalText: string, note: string, guard?: CompanionHighlightReadGuard) => Promise<void> | void;
  onApply: (kind: CompanionSelectionAnnotationKind, payload: SelectionCommandPayload, note?: string) => Promise<void> | void;
  onClose: () => void;
  onDeleteExistingHighlight: (nodeId: string, guard?: CompanionHighlightReadGuard) => Promise<void> | void;
  loadExistingHighlight?: ((nodeId: string) => Promise<CompanionHighlightRead>) | undefined;
  resolveSelectionPayload?: () => SelectionCommandPayload | null;
  state: CompanionSelectionAnnotationToolbarState | null;
}

function resolveApplyPayload(props: CompanionSelectionAnnotationToolbarProps) {
  return props.resolveSelectionPayload ? props.resolveSelectionPayload() : props.state?.payload ?? null;
}

export function CompanionSelectionAnnotationToolbar(props: CompanionSelectionAnnotationToolbarProps) {
  if (!props.state) return null;
  return <ToolbarSession key={props.state.existingHighlight?.nodeId ?? `${props.state.payload?.parentNodeId}:${props.state.payload?.anchorId}`} {...props} />;
}

function ToolbarSession(props: CompanionSelectionAnnotationToolbarProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const session = useCompanionHighlightSession(props.state?.existingHighlight, props.loadExistingHighlight);
  const creation = useCompanionSelectionApply({ ...props, resolvePayload: () => resolveApplyPayload(props) });
  const state = props.state!;
  const isExistingHighlight = Boolean(state.existingHighlight);
  const draft = isExistingHighlight ? session.draft : noteDraft;
  const disabled = isExistingHighlight ? session.loading || !session.ready || session.saving || session.saved : creation.saving || creation.saved;
  function applyExistingNote() {
    const target = state.existingHighlight;
    if (!target) return;
    session.save(() => props.onAddExistingHighlightNote(target.nodeId, target.originalText, session.draft, session.guard), props.onClose);
  }
  function deleteExistingHighlight() {
    const target = state.existingHighlight;
    if (!target) return;
    session.save(() => props.onDeleteExistingHighlight(target.nodeId, session.guard), props.onClose);
  }
  return (
    <div className="fixed z-floating" data-companion-selection-toolbar="true"
      onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => event.stopPropagation()}
      style={{ left: state.left, top: state.top }}>
      <CompanionSelectionToolbarActions isExistingHighlight={isExistingHighlight} disabled={disabled}
        onAddNote={() => setIsNoteOpen(true)} onApply={creation.apply} onDeleteExistingHighlight={deleteExistingHighlight} />
      {!isNoteOpen && !isExistingHighlight && creation.error ? <div className={`${appFloatingSurfaceClassName('popover')} mt-2 w-64 rounded-md p-2 text-sm`}>
        <CreationStatus creation={creation} />
      </div> : null}
      {!isNoteOpen && (session.loading || session.error) ? <div className={`${appFloatingSurfaceClassName('popover')} mt-2 w-64 rounded-md p-2 text-sm`}>
        <HighlightStatus session={session} onClose={props.onClose} />
      </div> : null}
      {isNoteOpen ? <CompanionSelectionNotePanel draft={draft} disabled={disabled} status={isExistingHighlight ? <HighlightStatus session={session} onClose={props.onClose} /> : creation.error ? <CreationStatus creation={creation} /> : null}
        left={state.noteLeft - state.left} top={state.noteTop - state.top}
        onCancel={() => setIsNoteOpen(false)} onChange={isExistingHighlight ? session.setDraft : setNoteDraft}
        onSave={() => isExistingHighlight ? applyExistingNote() : creation.apply('note', noteDraft)} /> : null}
    </div>
  );
}

function HighlightStatus({ session, onClose }: { session: ReturnType<typeof useCompanionHighlightSession>; onClose(): void }) {
  const t = useTranslation();
  if (session.loading) return <p role="status">{t('companion.selection.loading')}</p>;
  if (!session.error) return null;
  return <div className="mb-2 text-sm" role="alert">
    <p>{t(session.saved ? 'companion.selection.changesSavedRefreshError' : session.ready ? 'companion.selection.saveError' : 'companion.selection.loadError')}</p>
    {session.saved ? <AppButton disabled={session.saving || !session.canRetry} onClick={() => session.save(() => {}, onClose)}>{t('companion.selection.refresh')}</AppButton> : null}
    {!session.ready && session.canRetry ? <AppButton onClick={session.retry}>{t('companion.selection.retry')}</AppButton> : null}
  </div>;
}

function CreationStatus({ creation }: { creation: ReturnType<typeof useCompanionSelectionApply> }) {
  const t = useTranslation();
  return <div role="alert">
    <p>{t(creation.saved ? 'companion.selection.savedRefreshError' : 'companion.selection.createError')}</p>
    {creation.saved ? <AppButton disabled={creation.saving} onClick={creation.retryRefresh}>{t('companion.selection.refresh')}</AppButton> : null}
  </div>;
}
