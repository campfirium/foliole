import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { WebLookupEntry } from '../../../../shared/platform/webLookupEntries';
import { settingsActionTableRowClassName, settingsFieldClassName, settingsSwitchClassName, settingsSwitchKnobClassName, settingsUtilityIconButtonClassName } from '../../../../shared/ui';
import type { DocumentHeaderMenuItemConfig } from '../../model/documentHeaderMenuSettings';

import { DragHandle, MENU_ITEM_COLUMNS, MenuItemRemoveAction, WebLookupToggle } from './SettingsWebLookupSectionParts';

export interface ContextRowDrag {
  draggedKey: string | null;
  targetKey: string | null;
  onDragEnd: () => void;
  onDragEnter: (key: string) => void;
  onDragStart: (key: string) => void;
  onDrop: (target: string, source: string) => void;
}

function RowFrame(props: { children: ReactNode; drag: ContextRowDrag; itemKey: string; testId: string }) {
  return <div
    className={settingsActionTableRowClassName(MENU_ITEM_COLUMNS,
      props.drag.draggedKey === props.itemKey ? 'bg-settings-control-active opacity-70' :
        props.drag.targetKey === props.itemKey ? 'bg-settings-control-hover ring-1 ring-ring/45' : undefined)}
    data-context-menu-row
    data-testid={props.testId}
    onDragEnter={() => props.drag.onDragEnter(props.itemKey)}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => props.drag.onDrop(props.itemKey, event.dataTransfer.getData('text/plain'))}
  >{props.children}</div>;
}

export function LinkMenuRow(props: {
  drag: ContextRowDrag;
  entry: WebLookupEntry;
  itemKey: string;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<WebLookupEntry, 'enabled' | 'label' | 'urlTemplate'>>) => void;
}) {
  const t = useTranslation();
  const { entry } = props;
  return <RowFrame drag={props.drag} itemKey={props.itemKey} testId={`web-lookup-row-${entry.id}`}>
    <DragHandle id={props.itemKey} label={entry.label} onDragEnd={props.drag.onDragEnd} onDragStart={props.drag.onDragStart} />
    <input aria-label={t('settings.webLookup.menuLabelAria', { label: entry.label })} className={settingsFieldClassName()} onChange={(event) => props.onUpdate(entry.id, { label: event.target.value })} value={entry.label} />
    <input aria-label={t('settings.webLookup.linkAria', { label: entry.label })} className={settingsFieldClassName('font-mono text-[0.82rem]')} onChange={(event) => props.onUpdate(entry.id, { urlTemplate: event.target.value })} spellCheck={false} value={entry.urlTemplate} />
    <div className="flex justify-center"><WebLookupToggle entry={entry} onToggle={(enabled) => props.onUpdate(entry.id, { enabled })} /></div>
    <div className="flex justify-end"><MenuItemRemoveAction entry={entry} onRemove={props.onRemove} /></div>
  </RowFrame>;
}

export function CommandMenuRow(props: {
  drag: ContextRowDrag;
  item: DocumentHeaderMenuItemConfig;
  itemKey: string;
  label: string;
  onRemove: (id: string) => void;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const t = useTranslation();
  return <RowFrame drag={props.drag} itemKey={props.itemKey} testId={`context-command-row-${props.item.id}`}>
    <DragHandle id={props.itemKey} label={props.label} onDragEnd={props.drag.onDragEnd} onDragStart={props.drag.onDragStart} />
    <span className="min-w-0 truncate text-ui-md text-foreground">{props.label}</span>
    <span aria-hidden="true" />
    <div className="flex justify-center"><button aria-checked={props.item.visible} aria-label={t(props.item.visible ? 'settings.webLookup.hideMenuItem' : 'settings.webLookup.showMenuItem', { label: props.label })} className={settingsSwitchClassName(props.item.visible)} onClick={() => props.onToggle(props.item.id, !props.item.visible)} role="switch" type="button"><span aria-hidden="true" className={settingsSwitchKnobClassName(props.item.visible)} /></button></div>
    <div className="flex justify-end"><button aria-label={t('settings.webLookup.remove', { label: props.label })} className={settingsUtilityIconButtonClassName(false)} onClick={() => props.onRemove(props.item.id)} type="button"><Trash2 aria-hidden="true" size={15} /></button></div>
  </RowFrame>;
}
