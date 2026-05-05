import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

interface HotkeySettingsSectionProps {
  items: HotkeySettingItem[];
  onUpdate: (commandId: string, nextLabel: string) => HotkeyUpdateResult;
  onReset: (commandId: string) => void;
  onResetAll: () => void;
}

interface HotkeyRowProps {
  draft: string;
  item: HotkeySettingItem;
  message: string | undefined;
  onCommit: (commandId: string) => void;
  onReset: (commandId: string) => void;
  onSetDraft: (commandId: string, value: string) => void;
}

function useHotkeyDraftState(items: HotkeySettingItem[]) {
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const item of items) {
      nextDrafts[item.commandId] = item.shortcutLabel;
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
      const haystack = [item.title, item.commandId, item.section, item.shortcutLabel].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, query]);

  const updateDraft = (commandId: string, value: string) => {
    setDraftById((current) => ({ ...current, [commandId]: value }));
    setMessageById((current) => {
      const next = { ...current };
      delete next[commandId];
      return next;
    });
  };

  const commit = (commandId: string) => {
    const result = onUpdate(commandId, draftById[commandId] ?? '');
    if (result.status !== 'applied') {
      setMessageById((current) => ({ ...current, [commandId]: result.message ?? 'Shortcut is invalid.' }));
      return;
    }
    if (result.normalizedShortcutLabel) {
      setDraftById((current) => ({ ...current, [commandId]: result.normalizedShortcutLabel! }));
    }
    setMessageById((current) => {
      const next = { ...current };
      if (result.message) {
        next[commandId] = result.message;
      } else {
        delete next[commandId];
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

function HotkeyRow({ draft, item, message, onCommit, onReset, onSetDraft }: HotkeyRowProps) {
  const { badgeClass, badgeText } = conflictDisplay(item);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(item.commandId);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onSetDraft(item.commandId, item.shortcutLabel);
    }
  };

  return (
    <div className="settings-hotkey-row" key={item.commandId} role="listitem">
      <div className="settings-row-copy">
        <h4>{item.title}</h4>
        <p>{item.section ?? 'Other'}</p>
        {item.conflictMessage ? <p className="settings-hotkey-hint">{item.conflictMessage}</p> : null}
        {message ? <p className="settings-hotkey-error">{message}</p> : null}
      </div>
      <div className="settings-hotkey-controls">
        <input
          aria-label={`Shortcut for ${item.title}`}
          className="settings-hotkey-input"
          onBlur={() => onCommit(item.commandId)}
          onChange={(event) => onSetDraft(item.commandId, event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ctrl+K"
          type="text"
          value={draft}
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
            draft={draftById[item.commandId] ?? item.shortcutLabel}
            item={item}
            key={item.commandId}
            message={messageById[item.commandId]}
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
