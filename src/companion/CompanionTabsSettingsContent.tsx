import { GripVertical } from 'lucide-react';
import { useState } from 'react';

import {
  COMPANION_SECONDARY_DESTINATIONS,
  type CompanionSecondaryDestinationId,
  type CompanionTabConfig,
  type CompanionTabSlotId
} from './CompanionTabsConfig';

const TAB_LABELS: Record<CompanionTabSlotId, string> = {
  browse: 'Browse',
  learn: 'Learn',
  search: 'Search',
  settings: 'Settings',
  shortcut: 'Shortcut'
};

function moveTab(ids: CompanionTabSlotId[], fromId: CompanionTabSlotId, toId: CompanionTabSlotId) {
  const next = [...ids];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return ids;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function TabTargetSelect(props: {
  config: CompanionTabConfig;
  onConfigChange(config: CompanionTabConfig): void;
}) {
  return (
    <>
      <span className="min-w-0 flex-1 text-base font-medium text-foreground">Shortcut</span>
      <select
        aria-label="Shortcut tab target"
        className="h-10 max-w-[190px] shrink-0 rounded-md border border-border bg-canvas px-3 text-sm text-foreground"
        onChange={(event) => {
          props.onConfigChange({
            ...props.config,
            shortcut: event.target.value
              ? { destinationId: event.target.value as CompanionSecondaryDestinationId, enabled: true }
              : { ...props.config.shortcut, enabled: false }
          });
        }}
        value={props.config.shortcut.enabled ? props.config.shortcut.destinationId : ''}
      >
        <option value="">Hidden</option>
        {COMPANION_SECONDARY_DESTINATIONS.map((destination) => (
          <option key={destination.id} value={destination.id}>{destination.label}</option>
        ))}
      </select>
    </>
  );
}

export function CompanionTabsSettingsContent(props: {
  config: CompanionTabConfig;
  onConfigChange(config: CompanionTabConfig): void;
}) {
  const [draggedTabId, setDraggedTabId] = useState<CompanionTabSlotId | null>(null);

  return (
    <section className="px-1 py-4">
      <p className="mb-4 text-sm leading-6 text-companion-text-secondary">
        Drag tabs to reorder the bottom bar. Choose a shortcut when you want one extra tab.
      </p>
      <div className="divide-y divide-companion-divider border-y border-companion-divider">
        {props.config.orderedTabIds.map((tabId) => (
          <div
            className="flex items-center gap-3 py-3"
            data-testid={`tab-slot-${tabId}`}
            draggable
            key={tabId}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => setDraggedTabId(tabId)}
            onDrop={() => {
              if (!draggedTabId) return;
              setDraggedTabId(null);
              props.onConfigChange({
                ...props.config,
                orderedTabIds: moveTab(props.config.orderedTabIds, draggedTabId, tabId)
              });
            }}
          >
            <span aria-label={`Drag ${TAB_LABELS[tabId]}`} className="cursor-grab text-companion-text-secondary">
              <GripVertical className="h-5 w-5" />
            </span>
            {tabId === 'shortcut' ? (
              <TabTargetSelect config={props.config} onConfigChange={props.onConfigChange} />
            ) : (
              <span className="flex-1 text-base font-medium text-foreground">{TAB_LABELS[tabId]}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
