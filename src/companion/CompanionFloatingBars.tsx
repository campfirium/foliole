import type { ComponentType } from 'react';

import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import { CompanionBottomSyncStatus } from './CompanionBottomSyncStatus';
import {
  resolveCompanionTabs,
  type CompanionResolvedTab,
  type CompanionSecondaryDestinationId,
  type CompanionTabAction,
  type CompanionTabConfig
} from './CompanionTabsConfig';

export type { CompanionTabAction } from './CompanionTabsConfig';
export type BottomBarGrade = 1 | 2 | 3 | 4;

function TabButton(props: {
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-current={props.active ? 'page' : undefined}
      aria-label={props.label}
      className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors ${
        props.active ? 'bg-companion-accent-soft text-companion-accent' : 'text-companion-text-secondary'
      }`}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate">{props.label}</span>
    </button>
  );
}

export function CompanionBottomTabBar(props: {
  activeAction: CompanionTabAction;
  activeSecondaryDestinationId: CompanionSecondaryDestinationId | null;
  config: CompanionTabConfig;
  onAction(action: CompanionTabAction): void;
  onSecondaryDestination(destinationId: CompanionSecondaryDestinationId): void;
  syncProgress?: CompanionDesktopSyncProgress | null;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-20 border-t border-companion-divider bg-companion-content px-4 pb-5 pt-2 shadow-panel"
      data-testid="companion-bottom-tab-bar"
    >
      <CompanionBottomSyncStatus progress={props.syncProgress ?? null} />
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-1">
        {renderTabButtons(resolveCompanionTabs(props.config), props)}
      </div>
    </footer>
  );
}

function renderTabButtons(
  tabs: CompanionResolvedTab[],
  props: Pick<
    Parameters<typeof CompanionBottomTabBar>[0],
    'activeAction' | 'activeSecondaryDestinationId' | 'onAction' | 'onSecondaryDestination'
  >
) {
  const isShortcutActive = tabs.some(
    (tab) => tab.id === 'shortcut' && tab.destinationId === props.activeSecondaryDestinationId
  );
  return tabs.map((tab) => renderTabButton(tab, props, isShortcutActive));
}

function renderTabButton(
  tab: CompanionResolvedTab,
  props: Pick<
    Parameters<typeof CompanionBottomTabBar>[0],
    'activeAction' | 'activeSecondaryDestinationId' | 'onAction' | 'onSecondaryDestination'
  >,
  isShortcutActive: boolean
) {
  const isShortcut = tab.id === 'shortcut' && Boolean(tab.destinationId);
  const isActive = isShortcut
    ? props.activeSecondaryDestinationId === tab.destinationId
    : props.activeAction === tab.action && !isShortcutActive;
  return (
    <TabButton
      active={isActive}
      icon={tab.icon}
      key={tab.id}
      label={tab.label}
      onClick={() => {
        if (tab.destinationId) props.onSecondaryDestination(tab.destinationId);
        else if (tab.action) props.onAction(tab.action);
      }}
    />
  );
}
