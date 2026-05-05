import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../../lib/core/nodes/folderTopicItemCommands';
import {
  AppButton,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
  AppIconButton,
  AppToolbar,
  ToolbarActionGroup
} from '../../../shared/ui';

interface NodeListHeaderProps {
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
  onCreateCommand: (commandId: string) => void;
  onEmptyTrash: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  trashCount: number;
}

function renderCreateMenu(onCreateCommand: (commandId: string) => void) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <AppIconButton
          className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
          icon={<NewNoteIcon />}
          label="Create"
        />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" sideOffset={6}>
        {FOLDER_TOPIC_ITEM_COMMANDS.map((command) => (
          <AppDropdownMenuItem key={command.appCommandId} onSelect={() => onCreateCommand(command.appCommandId)}>
            {command.listLabel}
          </AppDropdownMenuItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function renderNodeListActions(
  onCollapseAll: () => void,
  onCreateCommand: (commandId: string) => void,
  onExpandAll: () => void
) {
  return (
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
      {renderCreateMenu(onCreateCommand)}
    </>
  );
}

function renderTrashActions(onEmptyTrash: () => void, trashCount: number) {
  return (
    <>
      <button aria-label="Create" className="sr-only" type="button">
        Create
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
  );
}

export function NodeListHeader({
  isTrashViewOpen,
  onOpenNotesView,
  onCreateCommand,
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
        {isTrashViewOpen
          ? renderTrashActions(onEmptyTrash, trashCount)
          : renderNodeListActions(onCollapseAll, onCreateCommand, onExpandAll)}
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
