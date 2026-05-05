interface NodeListContextMenuProps {
  isTrashMenu: boolean;
  left: number;
  onClose: () => void;
  onDeleteNode: () => void;
  onDeleteNodePermanently: () => void;
  onRestoreNode: () => void;
  top: number;
}

export function NodeListContextMenu({
  isTrashMenu,
  left,
  onClose,
  onDeleteNode,
  onDeleteNodePermanently,
  onRestoreNode,
  top
}: NodeListContextMenuProps) {
  return (
    <>
      <div aria-hidden="true" className="editor-context-menu-scrim" onPointerDown={onClose} />
      <div
        aria-label="Node commands"
        className="editor-context-menu"
        onContextMenu={(event) => event.preventDefault()}
        role="menu"
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        {isTrashMenu ? (
          <>
            <button className="editor-context-menu-item" onClick={onRestoreNode} role="menuitem" type="button">
              Restore
            </button>
            <button className="editor-context-menu-item" onClick={onDeleteNodePermanently} role="menuitem" type="button">
              Delete Permanently
            </button>
          </>
        ) : (
          <button className="editor-context-menu-item" onClick={onDeleteNode} role="menuitem" type="button">
            Delete Node
          </button>
        )}
      </div>
    </>
  );
}
