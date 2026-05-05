import { BookOpenText, GraduationCap, Search, Settings } from 'lucide-react';
import type { ComponentType } from 'react';

export type CompanionTabAction = 'review' | 'recent' | 'search' | 'more';
export type BottomBarGrade = 1 | 2 | 3 | 4;

const COMPANION_TABS: Array<{
  action: CompanionTabAction;
  icon: ComponentType<{ className?: string }>;
  label: string;
}> = [
  { action: 'recent', icon: BookOpenText, label: 'Browse' },
  { action: 'review', icon: GraduationCap, label: 'Learn' },
  { action: 'search', icon: Search, label: 'Search' },
  { action: 'more', icon: Settings, label: 'Settings' }
];

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
  onAction(action: CompanionTabAction): void;
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
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-1">
        {COMPANION_TABS.map((tab) => (
          <TabButton
            active={props.activeAction === tab.action}
            icon={tab.icon}
            key={tab.action}
            label={tab.label}
            onClick={() => props.onAction(tab.action)}
          />
        ))}
      </div>
    </footer>
  );
}
