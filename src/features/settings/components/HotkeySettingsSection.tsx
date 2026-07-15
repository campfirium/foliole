import { CirclePlus, X } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';

import { formatSerializedShortcutDisplayLabel } from '../../../shared/commands/shortcutDisplay';
import { cn } from '../../../shared/lib/utils';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  settingsHotkeyChipClassName,
  settingsHotkeyChipClearClassName,
  settingsHotkeyRowClassName,
  settingsResetButtonClassName,
  SettingsSection
} from '../../../shared/ui';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

import { HotkeySearchPanel } from './HotkeySettingsSearchPanel';
import {
  joinShortcutLabels,
  useHotkeySectionModel,
  type HotkeySlot
} from './HotkeySettingsSectionModel';

const HOTKEY_ICON_BUTTON_CLASS_NAME = settingsResetButtonClassName('size-8');
const MAC_SHORTCUT_SYMBOL_PATTERN = /[⌃⌥⇧⌘⌫↩⎋←↑→↓]/;

function macShortcutTextClassName(label: string) {
  return MAC_SHORTCUT_SYMBOL_PATTERN.test(label)
    ? 'bg-transparent font-sans text-ui-lg font-normal text-foreground/70'
    : undefined;
}

function macShortcutClearClassName(label: string) {
  return MAC_SHORTCUT_SYMBOL_PATTERN.test(label)
    ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
    : undefined;
}

interface HotkeySettingsSectionProps {
  items: HotkeySettingItem[];
  onUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onReset: (commandId: string) => void;
  onResetAll: () => void;
}

interface HotkeyRowProps {
  item: HotkeySettingItem;
  message: string | undefined;
  recordingSlot: HotkeySlot | undefined;
  onBeginRecording: (commandId: string, slot: HotkeySlot) => void;
  onClearShortcut: (commandId: string, slot: HotkeySlot) => void;
}

function conflictClassName(item: HotkeySettingItem) {
  if (item.conflictSeverity === 'error') return 'text-error';
  if (item.conflictSeverity === 'warning') return 'text-amber-700';
  return 'text-foreground/55';
}

function HotkeyChip(props: {
  ariaLabel: string;
  commandId: string;
  isRecording: boolean;
  label: string;
  slot: HotkeySlot;
  onBeginRecording: HotkeyRowProps['onBeginRecording'];
  onClearShortcut: HotkeyRowProps['onClearShortcut'];
}) {
  const t = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const displayLabel = props.isRecording ? t('settings.hotkeys.recording') : props.label || t('settings.hotkeys.blank');
  const chipState = props.isRecording ? 'recording' : props.label ? 'assigned' : 'empty';

  useEffect(() => {
    if (props.isRecording) buttonRef.current?.focus();
  }, [props.isRecording]);

  return (
    <span
      className={settingsHotkeyChipClassName(chipState, macShortcutTextClassName(displayLabel))}
      data-hotkey-recording={props.isRecording ? 'true' : undefined}
    >
      <button
        aria-label={props.ariaLabel}
        className="min-w-0 cursor-pointer truncate focus-visible:outline-none"
        onClick={() => props.onBeginRecording(props.commandId, props.slot)}
        ref={buttonRef}
        type="button"
      >
        {displayLabel}
      </button>
      {props.label && !props.isRecording ? (
        <button
          aria-label={t('settings.hotkeys.clearShortcut', { label: props.ariaLabel })}
          className={settingsHotkeyChipClearClassName(macShortcutClearClassName(displayLabel))}
          onClick={() => props.onClearShortcut(props.commandId, props.slot)}
          type="button"
        >
          <X aria-hidden="true" size={12} strokeWidth={2} />
        </button>
      ) : null}
    </span>
  );
}

function HotkeyDisplayChip(props: { label: string }) {
  return (
    <span className={settingsHotkeyChipClassName('assigned', macShortcutTextClassName(props.label))}>
      <span className="min-w-0 truncate">{props.label}</span>
    </span>
  );
}

function getDisplayEntries(item: HotkeySettingItem) {
  if (item.shortcutDisplayEntries?.length) {
    return item.shortcutDisplayEntries;
  }
  return [
    item.primaryShortcutLabel ? { label: formatSerializedShortcutDisplayLabel(item.primaryShortcutLabel), slot: 'primary' as const } : null,
    item.secondaryShortcutLabel ? { label: formatSerializedShortcutDisplayLabel(item.secondaryShortcutLabel), slot: 'secondary' as const } : null
  ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function HotkeyRow({ item, message, recordingSlot, onBeginRecording, onClearShortcut }: HotkeyRowProps) {
  const t = useTranslation();
  const primaryLabel = item.primaryShortcutLabel;
  const secondaryLabel = item.secondaryShortcutLabel;
  const addSlot: HotkeySlot = primaryLabel ? 'secondary' : 'primary';
  const displayEntries = [...getDisplayEntries(item)];
  if (recordingSlot && !displayEntries.some((entry) => entry.slot === recordingSlot)) {
    displayEntries.push({ label: '', slot: recordingSlot });
  }

  return (
    <div className={settingsHotkeyRowClassName()} role="listitem">
      <div className="min-w-0">
        <div className="truncate text-[0.95rem] text-foreground">{item.title}</div>
        <div className={cn('mt-0.5 truncate text-sm', conflictClassName(item))}>
          {item.conflictMessage ?? item.section ?? t('settings.hotkeys.otherSection')}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        {displayEntries.map((entry, index) => (
          <Fragment key={`${entry.slot}-${entry.label}`}>
            {index > 0 ? <span className="text-foreground/45">,</span> : null}
            {entry.slot === 'primary' || entry.slot === 'secondary' ? (
              <HotkeyChip
                ariaLabel={t(entry.slot === 'primary' ? 'settings.hotkeys.primaryShortcutFor' : 'settings.hotkeys.secondaryShortcutFor', { title: item.title })}
                commandId={item.commandId}
                isRecording={recordingSlot === entry.slot}
                label={entry.label}
                onBeginRecording={onBeginRecording}
                onClearShortcut={onClearShortcut}
                slot={entry.slot}
              />
            ) : (
              <HotkeyDisplayChip label={entry.label} />
            )}
          </Fragment>
        ))}
        {!secondaryLabel ? (
          <button
            aria-label={t('settings.hotkeys.addShortcut', { title: item.title })}
            className={HOTKEY_ICON_BUTTON_CLASS_NAME}
            onClick={() => onBeginRecording(item.commandId, addSlot)}
            type="button"
          >
            <CirclePlus aria-hidden="true" size={17} strokeWidth={1.9} />
          </button>
        ) : null}
        {message ? <p className="max-w-56 text-right text-[0.8rem] text-error">{message}</p> : null}
      </div>
    </div>
  );
}

function HotkeyList(props: {
  items: HotkeySettingItem[];
  model: ReturnType<typeof useHotkeySectionModel>;
}) {
  const t = useTranslation();

  return (
    <div aria-label={t('settings.hotkeys.commandList')} role="list">
      {props.items.map((item) => {
        const draft = props.model.draftById[item.commandId];
        const hasDraftChange = Boolean(draft && (draft.primary !== item.primaryShortcutLabel || draft.secondary !== item.secondaryShortcutLabel));
        const displayItem = hasDraftChange
          ? {
            ...item,
            primaryShortcutLabel: draft!.primary,
            secondaryShortcutLabel: draft!.secondary,
            shortcutSummaryLabel: joinShortcutLabels(draft!.primary, draft!.secondary),
            shortcutDisplayEntries: [
              draft!.primary ? { label: formatSerializedShortcutDisplayLabel(draft!.primary), slot: 'primary' as const } : null,
              draft!.secondary ? { label: formatSerializedShortcutDisplayLabel(draft!.secondary), slot: 'secondary' as const } : null
            ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          }
          : item;
        return (
          <HotkeyRow
            item={displayItem}
            key={item.commandId}
            message={props.model.messageById[item.commandId]}
            onBeginRecording={props.model.beginRecording}
            onClearShortcut={props.model.clearShortcut}
            recordingSlot={props.model.recording?.commandId === item.commandId ? props.model.recording.slot : undefined}
          />
        );
      })}
      {!props.items.length ? (
        <p className="border-t border-settings-divider/55 px-5 py-4 text-foreground/65">{t('settings.hotkeys.empty')}</p>
      ) : null}
    </div>
  );
}

export function HotkeySettingsSection({ items, onUpdate, onResetAll }: HotkeySettingsSectionProps) {
  void onResetAll;
  const t = useTranslation();
  const model = useHotkeySectionModel(items, onUpdate);
  return (
    <SettingsSection ariaLabel={t('settings.hotkeys.sectionAria')}>
      <div className="bg-settings-group">
        <HotkeySearchPanel
          count={model.filteredItems.length}
          filterMode={model.filterMode}
          onBeginSearchRecording={model.beginSearchRecording}
          onFilterModeChange={model.setFilterMode}
          onQueryChange={model.setQuery}
          query={model.query}
          searchRecording={Boolean(model.searchRecording)}
        />
        <HotkeyList items={model.filteredItems} model={model} />
      </div>
    </SettingsSection>
  );
}
