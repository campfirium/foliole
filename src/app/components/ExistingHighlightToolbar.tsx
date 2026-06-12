import { CornerDownRight, MessageSquare, MoreHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';

import { AnnotationNotePanel } from './AnnotationNotePanel';

function ExistingHighlightToolbarButton(props: {
  children: JSX.Element;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      className="flex size-8 items-center justify-center rounded-sm text-foreground/72 transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-selection-blue/40"
      onClick={props.onClick}
      onPointerDown={(event) => event.preventDefault()}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}

export function ExistingHighlightToolbar(props: {
  left: number;
  onClose: () => void;
  onCreateNote: (note: string) => void;
  onDeleteExistingHighlight: () => void;
  onOpenExistingHighlight: () => void;
  top: number;
}) {
  const t = useTranslation();
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);

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
      <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 px-1.5 py-1')} role="toolbar" style={{ opacity: 'var(--app-selection-toolbar-opacity)' }}>
        <ExistingHighlightToolbarButton label={t('desktop.highlightToolbar.close')} onClick={props.onDeleteExistingHighlight}>
          <X aria-hidden="true" size={19} strokeWidth={2} />
        </ExistingHighlightToolbarButton>
        <ExistingHighlightToolbarButton label={t('desktop.highlightToolbar.addComment')} onClick={() => setIsNoteOpen(true)}>
          <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
        </ExistingHighlightToolbarButton>
        <ExistingHighlightToolbarButton label={t('desktop.highlightToolbar.open')} onClick={props.onOpenExistingHighlight}>
          <CornerDownRight aria-hidden="true" size={19} strokeWidth={2} />
        </ExistingHighlightToolbarButton>
        <ExistingHighlightToolbarButton label={t('desktop.highlightToolbar.more')} onClick={() => undefined}>
          <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
        </ExistingHighlightToolbarButton>
      </div>
      {isNoteOpen ? (
        <AnnotationNotePanel
          draft={noteDraft}
          left={props.left}
          onCancel={() => setIsNoteOpen(false)}
          onChange={setNoteDraft}
          onSave={() => {
            props.onCreateNote(noteDraft);
            props.onClose();
          }}
          top={props.top + 42}
        />
      ) : null}
    </div>,
    document.body
  );
}
