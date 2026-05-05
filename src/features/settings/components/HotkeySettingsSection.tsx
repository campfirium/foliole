import { CirclePlus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '../../../shared/lib/utils';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const displayLabel = props.isRecording ? 'Press hotkey...' : props.label || 'Blank';
  const chipState = props.isRecording ? 'recording' : props.label ? 'assigned' : 'empty';

  useEffect(() => {
    if (props.isRecording) buttonRef.current?.focus();
  }, [props.isRecording]);

  return (
    <span
      className={settingsHotkeyChipClassName(chipState)}
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
          aria-label={`Clear ${props.ariaLabel}`}
          className={settingsHotkeyChipClearClassName()}
          onClick={() => props.onClearShortcut(props.commandId, props.slot)}
          type="button"
        >
          <X aria-hidden="true" size={12} strokeWidth={2} />
        </button>
      ) : null}
    </span>
  );
}

function HotkeyRow({ item, message, recordingSlot, onBeginRecording, onClearShortcut }: HotkeyRowProps) {
  const primaryLabel = item.primaryShortcutLabel;
  const secondaryLabel = item.secondaryShortcutLabel;
  const addSlot: HotkeySlot = primaryLabel ? 'secondary' : 'primary';

  return (
    <div className={settingsHotkeyRowClassName()} role="listitem">
      <div className="min-w-0">
        <div className="truncate text-[0.95rem] text-foreground">{item.title}</div>
        <div className={cn('mt-0.5 truncate text-sm', conflictClassName(item))}>
          {item.conflictMessage ?? item.section ?? 'Other'}
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <HotkeyChip
          ariaLabel={`Shortcut for ${item.title}`}
          commandId={item.commandId}
          isRecording={recordingSlot === 'primary'}
          label={primaryLabel}
          onBeginRecording={onBeginRecording}
          onClearShortcut={onClearShortcut}
          slot="primary"
        />
        {secondaryLabel || recordingSlot === 'secondary' ? (
          <>
            <span className="text-foreground/45">,</span>
            <HotkeyChip
              ariaLabel={`Secondary shortcut for ${item.title}`}
              commandId={item.commandId}
              isRecording={recordingSlot === 'secondary'}
              label={secondaryLabel}
              onBeginRecording={onBeginRecording}
              onClearShortcut={onClearShortcut}
              slot="secondary"
            />
          </>
        ) : null}
        {!secondaryLabel ? (
          <button
            aria-label={`Add shortcut for ${item.title}`}
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
  return (
    <div aria-label="Command shortcut list" role="list">
      {props.items.map((item) => {
        const draft = props.model.draftById[item.commandId];
        const displayItem = draft
          ? {
            ...item,
            primaryShortcutLabel: draft.primary,
            secondaryShortcutLabel: draft.secondary,
            shortcutSummaryLabel: joinShortcutLabels(draft.primary, draft.secondary)
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
        <p className="border-t border-settings-divider/55 px-5 py-4 text-foreground/65">No matching hotkeys.</p>
      ) : null}
    </div>
  );
}

export function HotkeySettingsSection({ items, onUpdate, onResetAll }: HotkeySettingsSectionProps) {
  void onResetAll;
  const model = useHotkeySectionModel(items, onUpdate);
  return (
    <SettingsSection ariaLabel="Hotkeys settings section">
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
