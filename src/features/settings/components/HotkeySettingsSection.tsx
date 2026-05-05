import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

interface HotkeySettingsSectionProps {
  items: HotkeySettingItem[];
  onUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onReset: (commandId: string) => void;
  onResetAll: () => void;
}

interface HotkeyRowProps {
  primaryDraft: string;
  secondaryDraft: string;
  item: HotkeySettingItem;
  primaryMessage: string | undefined;
  secondaryMessage: string | undefined;
  onCommit: (commandId: string, slot: 'primary' | 'secondary') => void;
  onReset: (commandId: string) => void;
  onSetDraft: (commandId: string, slot: 'primary' | 'secondary', value: string) => void;
}

function useHotkeyDraftState(items: HotkeySettingItem[]) {
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const item of items) {
      nextDrafts[`${item.commandId}:primary`] = item.primaryShortcutLabel;
      nextDrafts[`${item.commandId}:secondary`] = item.secondaryShortcutLabel;
    }
    setDraftById(nextDrafts);
  }, [items]);

  return {
    draftById,
    messageById,
    setDraftById,
    setMessageById
  };
}

function useHotkeySectionModel(items: HotkeySettingItem[], onUpdate: HotkeySettingsSectionProps['onUpdate']) {
  const [query, setQuery] = useState('');
  const { draftById, messageById, setDraftById, setMessageById } = useHotkeyDraftState(items);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }
    return items.filter((item) => {
      const haystack = [item.title, item.commandId, item.section, item.shortcutSummaryLabel].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, query]);

  const getDraftKey = (commandId: string, slot: 'primary' | 'secondary') => `${commandId}:${slot}`;

  const updateDraft = (commandId: string, slot: 'primary' | 'secondary', value: string) => {
    const draftKey = getDraftKey(commandId, slot);
    setDraftById((current) => ({ ...current, [draftKey]: value }));
    setMessageById((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  };

  const commit = (commandId: string, slot: 'primary' | 'secondary') => {
    const draftKey = getDraftKey(commandId, slot);
    const result = onUpdate(commandId, slot, draftById[draftKey] ?? '');
    if (result.status !== 'applied') {
      setMessageById((current) => ({ ...current, [draftKey]: result.message ?? 'Shortcut is invalid.' }));
      return;
    }
    if (result.normalizedShortcutLabel) {
      setDraftById((current) => ({ ...current, [draftKey]: result.normalizedShortcutLabel! }));
    }
    setMessageById((current) => {
      const next = { ...current };
      if (result.message) {
        next[draftKey] = result.message;
      } else {
        delete next[draftKey];
      }
      return next;
    });
  };

  return { query, setQuery, filteredItems, draftById, messageById, updateDraft, commit };
}

function conflictDisplay(item: HotkeySettingItem) {
  if (item.conflictSeverity === 'error') {
    return {
      badgeClass: 'settings-hotkey-badge settings-hotkey-badge-error',
      badgeText: 'Blocked'
    };
  }
  if (item.conflictSeverity === 'warning') {
    return {
      badgeClass: 'settings-hotkey-badge settings-hotkey-badge-warning',
      badgeText: 'Warning'
    };
  }
  return {
    badgeClass: null,
    badgeText: null
  };
}

function HotkeyInput(props: {
  ariaLabel: string;
  commandId: string;
  draft: string;
  slot: 'primary' | 'secondary';
  item: HotkeySettingItem;
  message: string | undefined;
  onCommit: HotkeyRowProps['onCommit'];
  onSetDraft: HotkeyRowProps['onSetDraft'];
}) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      props.onCommit(props.commandId, props.slot);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onSetDraft(
        props.commandId,
        props.slot,
        props.slot === 'primary' ? props.item.primaryShortcutLabel : props.item.secondaryShortcutLabel
      );
    }
  };

  return (
    <label className="settings-hotkey-input-wrap">
      <span className="sr-only">{props.ariaLabel}</span>
      <input
        aria-label={props.ariaLabel}
        className="settings-hotkey-input"
        onBlur={() => props.onCommit(props.commandId, props.slot)}
        onChange={(event) => props.onSetDraft(props.commandId, props.slot, event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={props.slot === 'primary' ? 'Primary' : 'Secondary'}
        type="text"
        value={props.draft}
      />
      {props.message ? <p className="settings-hotkey-error">{props.message}</p> : null}
    </label>
  );
}

function HotkeyRow({ primaryDraft, secondaryDraft, item, primaryMessage, secondaryMessage, onCommit, onReset, onSetDraft }: HotkeyRowProps) {
  const { badgeClass, badgeText } = conflictDisplay(item);

  return (
    <div className="settings-hotkey-row" key={item.commandId} role="listitem">
      <div className="settings-row-copy">
        <h4>{item.title}</h4>
        <p>{item.section ?? 'Other'}</p>
        {item.conflictMessage ? <p className="settings-hotkey-hint">{item.conflictMessage}</p> : null}
      </div>
      <div className="settings-hotkey-controls">
        <HotkeyInput
          ariaLabel={`Primary shortcut for ${item.title}`}
          commandId={item.commandId}
          draft={primaryDraft}
          item={item}
          message={primaryMessage}
          onCommit={onCommit}
          onSetDraft={onSetDraft}
          slot="primary"
        />
        <HotkeyInput
          ariaLabel={`Secondary shortcut for ${item.title}`}
          commandId={item.commandId}
          draft={secondaryDraft}
          item={item}
          message={secondaryMessage}
          onCommit={onCommit}
          onSetDraft={onSetDraft}
          slot="secondary"
        />
        <button className="settings-reset" onClick={() => onReset(item.commandId)} type="button">
          ↺
        </button>
        {item.isCustomized ? <span className="settings-hotkey-chip">Custom</span> : null}
        {badgeClass ? <span className={badgeClass}>{badgeText}</span> : null}
      </div>
    </div>
  );
}

export function HotkeySettingsSection({ items, onUpdate, onReset, onResetAll }: HotkeySettingsSectionProps) {
  const { query, setQuery, filteredItems, draftById, messageById, updateDraft, commit } = useHotkeySectionModel(
    items,
    onUpdate
  );

  return (
    <section aria-label="Hotkeys settings section" className="settings-group">
      <div className="settings-hotkey-toolbar">
        <h3 className="settings-group-title">Hotkeys</h3>
        <button className="settings-hotkey-reset-all" onClick={onResetAll} type="button">
          Reset all
        </button>
      </div>
      <div className="settings-hotkey-search-wrap">
        <span className="sr-only">Search shortcuts</span>
        <input
          aria-label="Search shortcuts"
          className="settings-hotkey-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands"
          type="search"
          value={query}
        />
      </div>
      <div aria-label="Command shortcut list" className="settings-hotkey-list" role="list">
        {filteredItems.map((item) => (
          <HotkeyRow
            primaryDraft={draftById[`${item.commandId}:primary`] ?? item.primaryShortcutLabel}
            secondaryDraft={draftById[`${item.commandId}:secondary`] ?? item.secondaryShortcutLabel}
            item={item}
            key={item.commandId}
            primaryMessage={messageById[`${item.commandId}:primary`]}
            secondaryMessage={messageById[`${item.commandId}:secondary`]}
            onCommit={commit}
            onReset={onReset}
            onSetDraft={updateDraft}
          />
        ))}
        {!filteredItems.length ? <p className="settings-hotkey-empty">No matching commands.</p> : null}
      </div>
    </section>
  );
}
