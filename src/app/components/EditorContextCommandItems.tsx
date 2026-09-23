import { Eraser, Table } from 'lucide-react';
import { Fragment } from 'react';

import type { DocumentHeaderMenuItemConfig } from '../../features/settings/model/documentHeaderMenuSettings';
import { loadEditorContextMenuItems } from '../../features/settings/model/editorContextMenuSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSelectionDropdownMenuItem } from '../../shared/ui';
import { APP_PALETTE_COMMANDS } from '../hooks/appPaletteCommandList';
import { localizePaletteCommandTitle } from '../hooks/appPaletteCommandLocalization';

interface EditorContextCommandItemsProps {
  source: DocumentHeaderMenuItemConfig['source'];
  onClose: () => void;
  onConfigureFormatCleanup?: () => void;
  onRepairTable?: () => void;
  onRunCommand?: (commandId: string) => void;
  repairTableAvailable?: boolean;
}

export function isEditorContextCommandShown(item: DocumentHeaderMenuItemConfig, props: Omit<EditorContextCommandItemsProps, 'source'>) {
  if (!item.visible) return false;
  if (item.commandId === APP_COMMAND_IDS.repairTable) return Boolean(props.repairTableAvailable && props.onRepairTable);
  if (item.commandId === APP_COMMAND_IDS.configureCleanFormatting) return Boolean(props.onConfigureFormatCleanup);
  return Boolean(props.onRunCommand);
}

function labelFor(item: DocumentHeaderMenuItemConfig, t: ReturnType<typeof useTranslation>) {
  if (item.commandId === APP_COMMAND_IDS.repairTable) return t('desktop.webLookup.repairTable');
  const command = APP_PALETTE_COMMANDS.find((candidate) => candidate.id === item.commandId);
  return item.labelOverride ?? localizePaletteCommandTitle(item.commandId, command?.title ?? item.commandId, t);
}

function runItem(item: DocumentHeaderMenuItemConfig, props: EditorContextCommandItemsProps) {
  if (item.commandId === APP_COMMAND_IDS.repairTable) {
    props.onRepairTable?.();
    return;
  }
  if (item.commandId === APP_COMMAND_IDS.configureCleanFormatting) {
    props.onConfigureFormatCleanup?.();
    return;
  }
  props.onRunCommand?.(item.commandId);
  props.onClose();
}

export function EditorContextCommandItem({ item, ...props }: { item: DocumentHeaderMenuItemConfig } & Omit<EditorContextCommandItemsProps, 'source'>) {
  const t = useTranslation();
  return <AppSelectionDropdownMenuItem onClick={() => runItem(item, { ...props, source: item.source })}>
        {item.commandId === APP_COMMAND_IDS.repairTable ? <Table aria-hidden="true" className="mr-2 shrink-0 text-foreground/62" size={15} strokeWidth={1.9} /> : null}
        {item.commandId === APP_COMMAND_IDS.configureCleanFormatting ? <Eraser aria-hidden="true" className="mr-2 shrink-0 text-foreground/62" size={15} strokeWidth={1.9} /> : null}
        <span className="min-w-0 truncate">{labelFor(item, t)}</span>
      </AppSelectionDropdownMenuItem>;
}

export function EditorContextCommandItems(props: EditorContextCommandItemsProps) {
  const items = loadEditorContextMenuItems().filter((item) => item.source === props.source && isEditorContextCommandShown(item, props));
  return <>{items.map((item, index) => <Fragment key={item.id}>
    {index > 0 && item.separatorBefore ? <div aria-hidden="true" className="my-1 h-px bg-border/10" role="separator" /> : null}
    <EditorContextCommandItem item={item} {...props} />
  </Fragment>)}</>;
}

export function hasEditorContextCommandItems(props: EditorContextCommandItemsProps) {
  return loadEditorContextMenuItems().some((item) => item.source === props.source && isEditorContextCommandShown(item, props));
}
