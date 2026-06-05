import { GripVertical } from 'lucide-react';
import { useState, type PointerEvent } from 'react';

import { parseLiteralUnion } from '../shared/lib/parseLiteralUnion';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../shared/localization/translations';

import {
  COMPANION_SECONDARY_DESTINATIONS,
  type CompanionTabConfig,
  type CompanionTabSlotId
} from './CompanionTabsConfig';

const TAB_LABEL_KEYS: Record<CompanionTabSlotId, TranslationKey> = {
  browse: 'companion.tabs.browse',
  learn: 'companion.tabs.learn',
  search: 'companion.tabs.search',
  settings: 'companion.tabs.settings',
  shortcut: 'companion.settings.tabs.shortcut'
};

const TAB_SLOT_IDS: CompanionTabSlotId[] = ['browse', 'learn', 'search', 'settings', 'shortcut'];
const COMPANION_SECONDARY_DESTINATION_IDS = COMPANION_SECONDARY_DESTINATIONS.map((destination) => destination.id);

function moveTab(ids: CompanionTabSlotId[], fromId: CompanionTabSlotId, toId: CompanionTabSlotId) {
  const next = [...ids];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return ids;
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return ids;
  next.splice(toIndex, 0, moved);
  return next;
}

function findTabSlotIdAtPoint(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY);
  const row = element?.closest('[data-tab-slot-id]');
  const tabId = row?.getAttribute('data-tab-slot-id');
  return parseLiteralUnion(tabId, TAB_SLOT_IDS);
}

function TabTargetSelect(props: {
  config: CompanionTabConfig;
  onConfigChange(config: CompanionTabConfig): void;
}) {
  const t = useTranslation();
  return (
    <>
      <span className="min-w-0 flex-1 text-base font-medium text-foreground">{t('companion.settings.tabs.shortcut')}</span>
      <select
        aria-label={t('companion.settings.tabs.shortcutTarget')}
        className="h-10 max-w-[190px] shrink-0 rounded-md border border-border bg-canvas px-3 text-sm text-foreground"
        onChange={(event) => {
          const destinationId = parseLiteralUnion(event.target.value, COMPANION_SECONDARY_DESTINATION_IDS);
          props.onConfigChange({
            ...props.config,
            shortcut: destinationId
              ? { destinationId, enabled: true }
              : { ...props.config.shortcut, enabled: false }
          });
        }}
        value={props.config.shortcut.enabled ? props.config.shortcut.destinationId : ''}
      >
        <option value="">{t('companion.settings.tabs.hidden')}</option>
        {COMPANION_SECONDARY_DESTINATIONS.map((destination) => (
          <option key={destination.id} value={destination.id}>{t(destination.labelKey)}</option>
        ))}
      </select>
    </>
  );
}

function TabDragHandle(props: {
  tabId: CompanionTabSlotId;
  onPointerEnd(event: PointerEvent<HTMLButtonElement>, tabId: CompanionTabSlotId): void;
  onPointerStart(event: PointerEvent<HTMLButtonElement>, tabId: CompanionTabSlotId): void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-label={t('companion.settings.tabs.drag', { label: t(TAB_LABEL_KEYS[props.tabId]) })}
      className="flex h-9 w-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-companion-text-secondary hover:bg-companion-surface-subtle active:cursor-grabbing"
      data-testid={`tab-slot-${props.tabId}-handle`}
      onPointerCancel={(event) => props.onPointerEnd(event, props.tabId)}
      onPointerDown={(event) => props.onPointerStart(event, props.tabId)}
      onPointerUp={(event) => props.onPointerEnd(event, props.tabId)}
      type="button"
    >
      <GripVertical className="h-5 w-5" />
    </button>
  );
}

export function CompanionTabsSettingsContent(props: {
  config: CompanionTabConfig;
  onConfigChange(config: CompanionTabConfig): void;
}) {
  const t = useTranslation();
  const [draggedTabId, setDraggedTabId] = useState<CompanionTabSlotId | null>(null);
  const handlePointerStart = (event: PointerEvent<HTMLButtonElement>, tabId: CompanionTabSlotId) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggedTabId(tabId);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!draggedTabId) return;
    setDraggedTabId(null);
    const targetTabId = findTabSlotIdAtPoint(event.clientX, event.clientY);
    if (!targetTabId) return;
    props.onConfigChange({
      ...props.config,
      orderedTabIds: moveTab(props.config.orderedTabIds, draggedTabId, targetTabId)
    });
  };

  return (
    <section className="px-1 py-4">
      <p className="mb-4 text-sm leading-6 text-companion-text-secondary">
        {t('companion.settings.tabs.description')}
      </p>
      <div className="divide-y divide-companion-divider border-y border-companion-divider">
        {props.config.orderedTabIds.map((tabId) => (
          <div
            className="flex items-center gap-3 py-3"
            data-tab-slot-id={tabId}
            data-testid={`tab-slot-${tabId}`}
            key={tabId}
          >
            <TabDragHandle
              onPointerEnd={handlePointerEnd}
              onPointerStart={handlePointerStart}
              tabId={tabId}
            />
            {tabId === 'shortcut' ? (
              <TabTargetSelect config={props.config} onConfigChange={props.onConfigChange} />
            ) : (
              <span className="flex-1 text-base font-medium text-foreground">{t(TAB_LABEL_KEYS[tabId])}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
