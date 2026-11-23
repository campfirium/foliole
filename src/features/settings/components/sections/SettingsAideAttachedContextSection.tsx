import { GripVertical } from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent } from 'react';

import {
  AIDE_ATTACHED_CONTEXT_MAX_BUDGET,
  type AideAttachedContextItemKey,
  type AideAttachedContextItemSetting,
  type AideAttachedContextSettings
} from '../../../../../lib/core/assistant/aideAttachedContextSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../../shared/localization/translations';
import { AppSwitch, SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, SettingsRow, settingsFieldClassName } from '../../../../shared/ui';

type Props = {
  onChange: (settings: AideAttachedContextSettings) => void;
  onCommit: () => void;
  settings: AideAttachedContextSettings;
};

export function aideContextItemTitleKey(key: AideAttachedContextItemKey) {
  return `settings.aideDialog.context.item.${key}.title` as TranslationKey;
}

function readNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(AIDE_ATTACHED_CONTEXT_MAX_BUDGET, Math.max(0, parsed)) : 0;
}

export function moveAideContextItem(items: AideAttachedContextItemSetting[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

export function SettingsAideAttachedContextSection({ onChange, onCommit, settings }: Props) {
  const t = useTranslation();
  const [dragged, setDragged] = useState<AideAttachedContextItemKey | null>(null);
  const setItems = (items: AideAttachedContextItemSetting[]) => onChange({ ...settings, items });
  const patchItem = (key: AideAttachedContextItemKey, patch: Partial<AideAttachedContextItemSetting>) =>
    setItems(settings.items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const move = (from: number, to: number) => setItems(moveAideContextItem(settings.items, from, to));
  return (
    <div>
      <SettingsRow
        description={t('settings.aideDialog.context.total.description')}
        title={t('settings.aideDialog.context.total.title')}
      >
        <input
          aria-label={t('settings.aideDialog.context.total.title')}
          className={settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
          inputMode="numeric"
          max={AIDE_ATTACHED_CONTEXT_MAX_BUDGET}
          min={0}
          onBlur={onCommit}
          onChange={(event) => onChange({ ...settings, totalBudget: readNumber(event.target.value) })}
          step={100}
          type="number"
          value={settings.totalBudget}
        />
      </SettingsRow>
      {settings.items.map((item, index) => (
        <AttachedContextItemRow
          dragging={dragged === item.key}
          index={index}
          item={item}
          key={item.key}
          onCommit={onCommit}
          onDragEnd={() => setDragged(null)}
          onDragStart={() => setDragged(item.key)}
          onDrop={() => {
            const from = settings.items.findIndex((entry) => entry.key === dragged);
            setDragged(null);
            move(from, index);
          }}
          onMove={(offset) => move(index, index + offset)}
          onPatch={(patch) => patchItem(item.key, patch)}
        />
      ))}
      <p className="mx-settings-panel-x mt-3 border-t border-settings-divider/70 pt-3 text-ui-sm leading-5 text-foreground/55">
        {t('settings.aideDialog.context.note')}
      </p>
    </div>
  );
}

function AttachedContextItemRow(props: {
  dragging: boolean;
  index: number;
  item: AideAttachedContextItemSetting;
  onCommit: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (offset: number) => void;
  onPatch: (patch: Partial<AideAttachedContextItemSetting>) => void;
}) {
  const t = useTranslation();
  const { item } = props;
  const label = t(aideContextItemTitleKey(item.key));
  return (
    <SettingsRow
      className={props.dragging ? 'opacity-45' : ''}
      data-attached-context-item={item.key}
      onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); props.onDrop(); }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <ItemDragHandle label={label} onDragStart={props.onDragStart} onDragEnd={props.onDragEnd} onMove={props.onMove} itemKey={item.key} />
        <div className="min-w-0">
          <h4 className="text-ui-lg font-normal text-foreground">{label}</h4>
          <p className="mt-0.5 text-ui-md leading-6 text-foreground/64">
            {t(`settings.aideDialog.context.item.${item.key}.description` as TranslationKey)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <input
          aria-label={t('settings.aideDialog.context.limit.aria', { label })}
          className={settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
          disabled={!item.enabled}
          inputMode="numeric"
          max={AIDE_ATTACHED_CONTEXT_MAX_BUDGET}
          min={0}
          onBlur={props.onCommit}
          onChange={(event) => props.onPatch({ limit: readNumber(event.target.value) })}
          step={50}
          type="number"
          value={item.limit}
        />
        <AppSwitch
          aria-label={t('settings.aideDialog.context.toggle.aria', { label })}
          checked={item.enabled}
          onCheckedChange={(enabled) => props.onPatch({ enabled })}
        />
      </div>
    </SettingsRow>
  );
}

function ItemDragHandle(props: {
  itemKey: AideAttachedContextItemKey;
  label: string;
  onDragEnd: () => void;
  onDragStart: () => void;
  onMove: (offset: number) => void;
}) {
  const t = useTranslation();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    props.onMove(event.key === 'ArrowUp' ? -1 : 1);
  };
  return (
    <button
      aria-label={t('settings.aideDialog.context.move.aria', { label: props.label })}
      className="mt-0.5 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-settings-icon hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
      draggable
      onDragEnd={props.onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', props.itemKey);
        props.onDragStart();
      }}
      onKeyDown={onKeyDown}
      type="button"
    >
      <GripVertical aria-hidden="true" size={16} />
    </button>
  );
}
