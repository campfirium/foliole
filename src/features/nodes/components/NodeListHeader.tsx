import type { MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, AppIconButton, AppToolbar, ToolbarActionGroup } from '../../../shared/ui';

interface NodeListHeaderProps {
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
  onCreateRootNode: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onEmptyTrash: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  trashCount: number;
}

export function NodeListHeader({
  isTrashViewOpen,
  onOpenNotesView,
  onCreateRootNode,
  onEmptyTrash,
  onCollapseAll,
  onExpandAll,
  trashCount
}: NodeListHeaderProps) {
  return (
    <AppToolbar as="header" className="min-h-[40px] justify-end gap-2 px-3">
      <h2 className="sr-only">Nodes</h2>
      <button className="sr-only" onClick={onOpenNotesView} type="button">
        Nodes
      </button>
      <ToolbarActionGroup ariaLabel={isTrashViewOpen ? 'Trash actions' : 'Node list actions'}>
        {isTrashViewOpen ? (
          <>
            <button aria-label="New" className="sr-only" onClick={onCreateRootNode} type="button">
              New
            </button>
            <AppButton
              aria-label="Empty"
              className="text-foreground/70 hover:text-foreground"
              disabled={trashCount === 0}
              onClick={onEmptyTrash}
              size="sm"
              variant="subtle"
            >
              Empty
            </AppButton>
          </>
        ) : (
          <>
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
              icon={<ExpandAllIcon />}
              label="Expand all"
              onClick={onExpandAll}
            />
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
              icon={<CollapseAllIcon />}
              label="Collapse all"
              onClick={onCollapseAll}
            />
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
              icon={<NewNoteIcon />}
              label="New"
              onClick={onCreateRootNode}
            />
          </>
        )}
      </ToolbarActionGroup>
    </AppToolbar>
  );
}

function NewNoteIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 16 16">
      <path
        d="M3 2.5h6.8L13 5.7v7.8H3z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <path
        d="M9.8 2.5v3.2H13"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <path
        d="m6.2 10.8 2.9-2.9 1.2 1.2-2.9 2.9-1.8.6z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}

function ExpandAllIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path
        d="M3.5 4.5h5M3.5 8h9M3.5 11.5h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.05"
      />
      <path
        d="M10.5 2.8 13 5.4l-2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}

function CollapseAllIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16">
      <path
        d="M3.5 4.5h5M3.5 8h9M3.5 11.5h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.05"
      />
      <path
        d="M12.9 2.8 10.4 5.4l2.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
    </svg>
  );
}
