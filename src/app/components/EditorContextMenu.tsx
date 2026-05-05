export interface EditorContextMenuProps {
  canRunCommands: boolean;
  left: number;
  top: number;
  onClose: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
}

export function EditorContextMenu({
  canRunCommands,
  left,
  top,
  onClose,
  onCreateHighlight,
  onCreateCloze
}: EditorContextMenuProps) {
  return (
    <>
      <div aria-hidden="true" className="editor-context-menu-scrim" onPointerDown={onClose} />
      <div
        aria-label="Editor commands"
        className="editor-context-menu"
        onContextMenu={(event) => event.preventDefault()}
        role="menu"
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        <button
          className="editor-context-menu-item"
          disabled={!canRunCommands}
          onClick={onCreateHighlight}
          role="menuitem"
          type="button"
        >
          Highlight
        </button>
        <button
          className="editor-context-menu-item"
          disabled={!canRunCommands}
          onClick={onCreateCloze}
          role="menuitem"
          type="button"
        >
          Cloze
        </button>
      </div>
    </>
  );
}
