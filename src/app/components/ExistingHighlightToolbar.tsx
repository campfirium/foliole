import { CornerDownRight, MessageSquare, MoreHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { AnnotationNotePanel } from './AnnotationNotePanel';
import { AnnotationToolbarButton } from './AnnotationToolbarButton';
import { useAnnotationNoteSave } from './useAnnotationNoteSave';

function ExistingHighlightNotePanel(props: {
  draft: string;
  error: string | null;
  left: number;
  onClosePanel: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  top: number;
}) {
  return (
    <AnnotationNotePanel
      draft={props.draft}
      error={props.error}
      left={props.left}
      onCancel={props.onClosePanel}
      onChange={props.onDraftChange}
      onSave={() => void props.onSave()}
      saving={props.saving}
      top={props.top}
    />
  );
}

function ExistingHighlightActions(props: {
  onAddAnnotation: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const t = useTranslation();
  return (
    <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 px-1.5 py-1')} role="toolbar" style={{ opacity: 'var(--app-selection-toolbar-opacity)' }}>
      <AnnotationToolbarButton label={t('desktop.highlightToolbar.close')} onClick={props.onDelete}>
        <X aria-hidden="true" size={19} strokeWidth={2} />
      </AnnotationToolbarButton>
      <AnnotationToolbarButton label={t('desktop.highlightToolbar.addComment')} onClick={props.onAddAnnotation}>
        <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
      </AnnotationToolbarButton>
      <AnnotationToolbarButton label={t('desktop.highlightToolbar.open')} onClick={props.onOpen}>
        <CornerDownRight aria-hidden="true" size={19} strokeWidth={2} />
      </AnnotationToolbarButton>
      <AnnotationToolbarButton label={t('desktop.highlightToolbar.more')} onClick={() => undefined}>
        <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
      </AnnotationToolbarButton>
    </div>
  );
}

export function ExistingHighlightToolbar(props: {
  existingNote?: string | null;
  left: number;
  onClose: () => void;
  onCreateNote: (note: string) => boolean | Promise<boolean> | void;
  onDeleteExistingHighlight: () => void;
  onOpenExistingHighlight: () => void;
  top: number;
}) {
  const [noteDraft, setNoteDraft] = useState(props.existingNote ?? '');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const noteSave = useAnnotationNoteSave({
    draft: noteDraft,
    onClose: props.onClose,
    onCreateNote: props.onCreateNote
  });
  useEffect(() => {
    setNoteDraft(props.existingNote ?? '');
    setIsNoteOpen(false);
    noteSave.clearError();
  }, [noteSave.clearError, props.existingNote]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-floating"
      data-annotation-toolbar="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: props.left, top: props.top }}
    >
      <ExistingHighlightActions
        onAddAnnotation={() => setIsNoteOpen(true)}
        onDelete={props.onDeleteExistingHighlight}
        onOpen={props.onOpenExistingHighlight}
      />
      {isNoteOpen ? (
        <ExistingHighlightNotePanel
          draft={noteDraft}
          error={noteSave.error}
          left={props.left}
          onClosePanel={() => { setIsNoteOpen(false); noteSave.clearError(); }}
          onDraftChange={(value) => { setNoteDraft(value); noteSave.clearError(); }}
          onSave={noteSave.save}
          saving={noteSave.saving}
          top={props.top + 42}
        />
      ) : null}
    </div>,
    document.body
  );
}
