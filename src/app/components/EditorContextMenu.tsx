import { Highlighter, MessageSquare, MoreHorizontal, RectangleEllipsis, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../shared/lib/utils';
import { AppButton, AppSelectionDropdownMenu, AppSelectionDropdownMenuItem, appFloatingSurfaceClassName } from '../../shared/ui';

export interface EditorContextMenuProps {
  kind: 'image' | 'selection';
  left: number;
  mode?: 'annotation-toolbar' | 'context-menu' | 'existing-highlight-toolbar';
  notePanelLeft?: number;
  notePanelTop?: number;
  top: number;
  onClose: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateNote: (note: string) => void;
  onDeleteExistingHighlight: () => void;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
}

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

function AnnotationNotePanel(props: {
  draft: string;
  left: number;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  top: number;
}) {
  return (
    <div
      className={cn(appFloatingSurfaceClassName('popover'), 'fixed z-50 w-60 rounded-md p-2')}
      data-annotation-toolbar="true"
      style={{ left: props.left, top: props.top }}
    >
      <textarea
        autoFocus
        className="min-h-16 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 text-foreground outline-none placeholder:text-foreground/45"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="Add a note..."
        value={props.draft}
      />
      <div className="mt-2 flex justify-end gap-2">
        <AppButton onClick={props.onCancel} size="sm" variant="ghost">Cancel</AppButton>
        <AppButton disabled={!props.draft.trim()} onClick={props.onSave} size="sm">Save</AppButton>
      </div>
    </div>
  );
}

function resolveNotePanelPosition(props: Pick<EditorContextMenuProps, 'left' | 'notePanelLeft' | 'notePanelTop' | 'top'>) {
  return {
    left: props.notePanelLeft ?? props.left,
    top: props.notePanelTop ?? props.top + 42
  };
}

function AnnotationToolbar(props: Pick<EditorContextMenuProps, 'left' | 'top' | 'onClose' | 'onCreateHighlight' | 'onCreateNote' | 'onCreateCloze'>) {
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50"
      data-annotation-toolbar="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: props.left, top: props.top }}
    >
      <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 rounded-md px-1.5 py-1')} role="toolbar">
        <AnnotationToolbarButton label="Highlight" onClick={props.onCreateHighlight}>
          <Highlighter aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <AnnotationToolbarButton label="Add Note" onClick={() => setIsNoteOpen(true)}>
          <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <AnnotationToolbarButton label="Cloze" onClick={props.onCreateCloze}>
          <RectangleEllipsis aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <AnnotationToolbarButton label="More" onClick={() => undefined}>
          <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
      </div>
      {isNoteOpen ? (
        <AnnotationNotePanel
          draft={noteDraft}
          {...resolveNotePanelPosition(props)}
          onCancel={() => setIsNoteOpen(false)}
          onChange={setNoteDraft}
          onSave={() => {
            props.onCreateNote(noteDraft);
            props.onClose();
          }}
        />
      ) : null}
    </div>,
    document.body
  );
}

function ExistingHighlightToolbar(props: Pick<EditorContextMenuProps, 'left' | 'top' | 'onClose' | 'onCreateNote' | 'onDeleteExistingHighlight'>) {
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-50"
      data-annotation-toolbar="true"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left: props.left, top: props.top }}
    >
      <div className={cn(appFloatingSurfaceClassName('popover'), 'flex items-center gap-1 rounded-md px-1.5 py-1')} role="toolbar">
        <AnnotationToolbarButton label="Close Highlight" onClick={props.onDeleteExistingHighlight}>
          <X aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <AnnotationToolbarButton label="Add Note" onClick={() => setIsNoteOpen(true)}>
          <MessageSquare aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
        <AnnotationToolbarButton label="More" onClick={() => undefined}>
          <MoreHorizontal aria-hidden="true" size={19} strokeWidth={2} />
        </AnnotationToolbarButton>
      </div>
      {isNoteOpen ? (
        <AnnotationNotePanel
          draft={noteDraft}
          {...resolveNotePanelPosition(props)}
          onCancel={() => setIsNoteOpen(false)}
          onChange={setNoteDraft}
          onSave={() => {
            props.onCreateNote(noteDraft);
            props.onClose();
          }}
        />
      ) : null}
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

  if (props.mode !== 'annotation-toolbar') {
    return null;
  }

  return <AnnotationToolbar {...props} />;
}
