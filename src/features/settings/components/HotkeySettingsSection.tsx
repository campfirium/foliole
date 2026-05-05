import { useEffect, useMemo, useState } from 'react';

import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

interface HotkeySettingsSectionProps {
  items: HotkeySettingItem[];
  onUpdate: (commandId: string, nextLabel: string) => HotkeyUpdateResult;
  onReset: (commandId: string) => void;
  onResetAll: () => void;
}

export function HotkeySettingsSection({ items, onUpdate, onReset, onResetAll }: HotkeySettingsSectionProps) {
  const [query, setQuery] = useState('');
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [messageById, setMessageById] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const item of items) {
      nextDrafts[item.commandId] = item.shortcutLabel;
    }
    setDraftById(nextDrafts);
  }, [items]);

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
  };

  const commit = (commandId: string) => {
    const currentDraft = draftById[commandId] ?? '';
    const result = onUpdate(commandId, currentDraft);

    if (result.status === 'applied') {
      setMessageById((current) => {
        const next = { ...current };
        if (!result.message) {
          delete next[commandId];
        } else {
          next[commandId] = result.message;
        }
        return next;
      });
      if (result.normalizedShortcutLabel) {
        const normalizedLabel = result.normalizedShortcutLabel;
        setDraftById((current) => ({ ...current, [commandId]: normalizedLabel }));
      }
      return;
    }

    setMessageById((current) => ({ ...current, [commandId]: result.message ?? 'Shortcut is invalid.' }));
  };

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
      <div className="settings-hotkey-list" role="list" aria-label="Command shortcut list">
        {filteredItems.map((item) => {
          const draft = draftById[item.commandId] ?? item.shortcutLabel;
          const extraMessage = messageById[item.commandId];
          const conflictClass =
            item.conflictSeverity === 'error'
              ? 'settings-hotkey-badge settings-hotkey-badge-error'
              : item.conflictSeverity === 'warning'
                ? 'settings-hotkey-badge settings-hotkey-badge-warning'
                : null;
          const conflictText = item.conflictSeverity === 'error' ? 'Blocked' : item.conflictSeverity === 'warning' ? 'Warning' : null;

          return (
            <div className="settings-hotkey-row" key={item.commandId} role="listitem">
              <div className="settings-row-copy">
                <h4>{item.title}</h4>
                <p>{item.section ?? 'Other'}</p>
                {item.conflictMessage ? <p className="settings-hotkey-hint">{item.conflictMessage}</p> : null}
                {extraMessage ? <p className="settings-hotkey-error">{extraMessage}</p> : null}
              </div>
              <div className="settings-hotkey-controls">
                <input
                  aria-label={`Shortcut for ${item.title}`}
                  className="settings-hotkey-input"
                  onBlur={() => commit(item.commandId)}
                  onChange={(event) => updateDraft(item.commandId, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commit(item.commandId);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setDraftById((current) => ({ ...current, [item.commandId]: item.shortcutLabel }));
                      setMessageById((current) => {
                        const next = { ...current };
                        delete next[item.commandId];
                        return next;
                      });
                    }
                  }}
                  placeholder="Ctrl+K"
                  type="text"
                  value={draft}
                />
                <button className="settings-reset" onClick={() => onReset(item.commandId)} type="button">
                  ↺
                </button>
                {item.isCustomized ? <span className="settings-hotkey-chip">Custom</span> : null}
                {conflictClass ? <span className={conflictClass}>{conflictText}</span> : null}
              </div>
            </div>
          );
        })}
        {!filteredItems.length ? <p className="settings-hotkey-empty">No matching commands.</p> : null}
      </div>
    </section>
  );
}
