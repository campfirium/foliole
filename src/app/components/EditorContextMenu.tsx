import { Highlighter, MessageSquare, MoreHorizontal, SquaresSubtract } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem, appFloatingSurfaceClassName } from '../../shared/ui';
import { resolveLongClozeGuardAction } from '../hooks/editorClozeGuardrail';

import { AnnotationNotePanel } from './AnnotationNotePanel';
import { ClozeGuardPanel } from './ClozeGuardPanel';
import type { EditorContextMenuProps } from './editorContextMenuProps';
import { ExistingHighlightToolbar } from './ExistingHighlightToolbar';
import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

function AnnotationToolbarButton(props: {
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

function resolveNotePanelPosition(props: Pick<EditorContextMenuProps, 'left' | 'notePanelLeft' | 'notePanelTop' | 'top'>) {
  return {
    left: props.notePanelLeft ?? props.left,
    top: props.notePanelTop ?? props.top + 42
  };
}

type AnnotationToolbarProps = Pick<EditorContextMenuProps, 'initialNoteOpen' | 'left' | 'notePanelLeft' | 'notePanelTop' | 'selectionPayload' | 'top' | 'onClose' | 'onCreateHighlight' | 'onCreateClozeFromPayload' | 'onCreateHighlightFromPayload' | 'onCreateNote' | 'onCreateCloze'>;

function createClozeToolbarAction(props: Pick<AnnotationToolbarProps, 'onCreateCloze' | 'onCreateClozeFromPayload' | 'onCreateHighlight' | 'onCreateHighlightFromPayload' | 'selectionPayload'> & { onOpenGuard: () => void }) {
  return () => {
    const payload = props.selectionPayload;
    const action = payload ? resolveLongClozeGuardAction(payload) : 'cloze';
    if (action === 'highlight') {
      if (payload) {
        props.onCreateHighlightFromPayload(payload);
        return;
      }
      props.onCreateHighlight();
      return;
    }
    if (action === 'remind') {
      props.onOpenGuard();
      return;
    }
    if (payload) {
      props.onCreateClozeFromPayload(payload, { onRemind: props.onOpenGuard });
      return;
    }
    props.onCreateCloze({ onRemind: props.onOpenGuard });
  };
}

function ClozeToolbarButton(props: Pick<AnnotationToolbarProps, 'onCreateCloze' | 'onCreateClozeFromPayload' | 'onCreateHighlight' | 'onCreateHighlightFromPayload' | 'selectionPayload'> & { onOpenGuard: () => void }) {
  return (
    <AnnotationToolbarButton
      label="Cloze"
      onClick={createClozeToolbarAction(props)}
    >
      <SquaresSubtract aria-hidden="true" size={19} strokeWidth={2} />
    </AnnotationToolbarButton>
  );
}

function AnnotationToolbarPanels(props: AnnotationToolbarProps & {
  isClozeGuardOpen: boolean;
  isNoteOpen: boolean;
  noteDraft: string;
  onChangeNote: (value: string) => void;
  onCloseNote: () => void;
}) {
  return (
    <>
      {props.isNoteOpen ? (
        <AnnotationNotePanel
          draft={props.noteDraft}
          {...resolveNotePanelPosition(props)}
          onCancel={props.onCloseNote}
          onChange={props.onChangeNote}
          onSave={() => {
            props.onCreateNote(props.noteDraft);
            props.onClose();
          }}
        />
      ) : null}
      {props.isClozeGuardOpen ? (
        <ClozeGuardPanel
          {...resolveNotePanelPosition(props)}
          onCancel={props.onClose}
          onCreateCloze={() => {
            if (props.selectionPayload) {
              props.onCreateClozeFromPayload(props.selectionPayload, { skipGuard: true });
              return;
            }
            props.onCreateCloze({ skipGuard: true });
          }}
          onCreateHighlight={() => {
            if (props.selectionPayload) {
              props.onCreateHighlightFromPayload(props.selectionPayload);
              return;
            }
            props.onCreateHighlight();
          }}
        />
      ) : null}
    </>
  );
}

function AnnotationToolbar(props: AnnotationToolbarProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(Boolean(props.initialNoteOpen));
  const [isClozeGuardOpen, setIsClozeGuardOpen] = useState(false);

  useEffect(() => {
    setIsNoteOpen(Boolean(props.initialNoteOpen));
  }, [props.initialNoteOpen, props.selectionPayload]);

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
      <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 rounded-md px-1.5 py-1')} role="toolbar" style={{ opacity: 'var(--app-selection-toolbar-opacity)' }}>
        <AnnotationToolbarButton label="Highlight" onClick={props.onCreateHighlight}>
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <AnnotationToolbarButton label="Add Note" onClick={() => setIsNoteOpen(true)}>
          <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <ClozeToolbarButton
          onCreateCloze={props.onCreateCloze}
          onCreateClozeFromPayload={props.onCreateClozeFromPayload}
          onCreateHighlight={props.onCreateHighlight}
          onCreateHighlightFromPayload={props.onCreateHighlightFromPayload}
          onOpenGuard={() => setIsClozeGuardOpen(true)}
          selectionPayload={props.selectionPayload}
        />
        <AnnotationToolbarButton label="More" onClick={() => undefined}>
          <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
      </div>
      <AnnotationToolbarPanels
        {...props}
        isClozeGuardOpen={isClozeGuardOpen}
        isNoteOpen={isNoteOpen}
        noteDraft={noteDraft}
        onChangeNote={setNoteDraft}
        onCloseNote={() => setIsNoteOpen(false)}
      />
    </div>,
    document.body
  );
}

export function EditorContextMenu(props: EditorContextMenuProps) {
  if (props.kind === 'image') {
    return (
      <AppSelectionDropdownMenu left={props.left} onClose={props.onClose} top={props.top}>
        <AppSelectionDropdownMenuItem onClick={props.onCopyImage}>Copy image</AppSelectionDropdownMenuItem>
        <AppSelectionDropdownMenuItem onClick={props.onCutImage}>Cut image</AppSelectionDropdownMenuItem>
        <AppSelectionDropdownMenuItem onClick={props.onExportImage}>Export image</AppSelectionDropdownMenuItem>
        <AppSelectionDropdownMenuItem onClick={props.onDeleteImage}>Delete image</AppSelectionDropdownMenuItem>
      </AppSelectionDropdownMenu>
    );
  }

  if (props.mode === 'existing-highlight-toolbar') {
    return <ExistingHighlightToolbar {...props} />;
  }

  if (props.mode === 'context-menu') {
    return (
      <WebLookupSelectionMenu
        documentText={props.webLookupDocumentText}
        left={props.left}
        onClose={props.onClose}
        selectionPayload={props.webLookupPayload}
        titleText={props.webLookupTitle}
        top={props.top}
        {...definedProps({
          onRepairTable: props.onRepairTable,
          repairTableAvailable: props.repairTableAvailable
        })}
      />
    );
  }

  if (props.mode !== 'annotation-toolbar') {
    return null;
  }

  return <AnnotationToolbar {...props} />;
}
