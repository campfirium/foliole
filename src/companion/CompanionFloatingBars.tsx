import type { LucideIcon } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionBottomAction } from './CompanionBottomAction';
import { CompanionBottomBar } from './CompanionBottomBar';
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
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  testId: string;
}) {
  const Icon = props.icon;
  return (
    <CompanionBottomAction
      {...props}
      icon={<Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />}
    />
  );
}

export function CompanionBottomTabBar(props: {
  activeAction: CompanionTabAction;
  activeSecondaryDestinationId: CompanionSecondaryDestinationId | null;
  config: CompanionTabConfig;
  onAction(action: CompanionTabAction): void;
  onSecondaryDestination(destinationId: CompanionSecondaryDestinationId): void;
  visible: boolean;
}) {
  const t = useTranslation();
  if (!props.visible) {
    return null;
  }

  return (
    <CompanionBottomBar testId="companion-bottom-tab-bar">
      {renderTabButtons(resolveCompanionTabs(props.config), props, t)}
    </CompanionBottomBar>
  );
}

function renderTabButtons(
  tabs: CompanionResolvedTab[],
  props: Pick<
    Parameters<typeof CompanionBottomTabBar>[0],
    'activeAction' | 'activeSecondaryDestinationId' | 'onAction' | 'onSecondaryDestination'
  >,
  t: ReturnType<typeof useTranslation>
) {
  const isShortcutActive = tabs.some(
    (tab) => tab.id === 'shortcut' && tab.destinationId === props.activeSecondaryDestinationId
  );
  return tabs.map((tab) => renderTabButton(tab, props, isShortcutActive, t));
}

function renderTabButton(
  tab: CompanionResolvedTab,
  props: Pick<
    Parameters<typeof CompanionBottomTabBar>[0],
    'activeAction' | 'activeSecondaryDestinationId' | 'onAction' | 'onSecondaryDestination'
  >,
  isShortcutActive: boolean,
  t: ReturnType<typeof useTranslation>
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
      label={t(tab.labelKey)}
      testId={`companion-tab-${tab.id}`}
      onClick={() => {
        if (tab.destinationId) props.onSecondaryDestination(tab.destinationId);
        else if (tab.action) props.onAction(tab.action);
      }}
    />
  );
}
