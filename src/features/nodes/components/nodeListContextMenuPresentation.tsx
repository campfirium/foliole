import {
  FilePlus2,
  FolderPlus,
  ListRestart,
  ListPlus,
  SmilePlus,
  type LucideIcon
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { FolderTopicItemCommandDefinition } from '../../../../lib/core/nodes/folderTopicItemCommands';
import type { VirtualNodeCommandDefinition } from '../../../../lib/core/nodes/virtualNodeCommands';

import { AppDropdownMenuItem, AppDropdownMenuSeparator, ActionHelpCard, type ActionHelpCardCopy } from '@/shared/ui';

export const nodeContextMenuSeparatorClassName = 'mx-1 my-1.5 h-px bg-[var(--app-floating-divider-color)]';

const menuItemClassName = [
  'min-h-7 gap-2 rounded-md px-2 py-1 text-[13px] font-normal leading-5 text-foreground/78',
  'focus:bg-[var(--node-context-menu-item-hover-bg)] focus:text-foreground',
  'data-[highlighted]:bg-[var(--node-context-menu-item-hover-bg)] data-[highlighted]:text-foreground'
].join(' ');
const menuIconClassName = 'h-3.5 w-3.5 shrink-0 text-foreground/48';

export function NodeContextMenuSeparator() {
  return <AppDropdownMenuSeparator className={nodeContextMenuSeparatorClassName} />;
}

export function NodeContextMenuItem({
  children,
  help,
  icon: Icon,
  onSelect,
  tone
}: {
  children: ReactNode;
  help?: ActionHelpCardCopy;
  icon: LucideIcon;
  onSelect: () => void;
  tone?: 'destructive';
}) {
  const destructiveClassName =
    tone === 'destructive'
      ? 'text-error/90 focus:text-error data-[highlighted]:text-error'
      : '';
  const iconDestructiveClassName = tone === 'destructive' ? 'text-error/75' : '';
  const item = (
    <AppDropdownMenuItem className={`${menuItemClassName} ${destructiveClassName}`} onSelect={onSelect}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Icon className={`${menuIconClassName} ${iconDestructiveClassName}`} strokeWidth={1.75} />
      </span>
      <span className="flex-1 truncate">{children}</span>
    </AppDropdownMenuItem>
  );
  return help ? <ActionHelpCard help={help}>{item}</ActionHelpCard> : item;
}

export function iconForCreateCommand(command: FolderTopicItemCommandDefinition | VirtualNodeCommandDefinition) {
  if ('kind' in command && command.kind === 'folder') return FolderPlus;
  if ('kind' in command && command.kind === 'item') return ListPlus;
  return FilePlus2;
}

export const RelearnMenuIcon = ListRestart;
export const DismissMenuIcon = SmilePlus;
