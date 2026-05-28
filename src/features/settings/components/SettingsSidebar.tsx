import {
  Archive,
  BookOpenText,
  FolderOpen,
  FolderSearch,
  Globe2,
  Info,
  Keyboard,
  Library,
  ListChecks,
  MousePointer2,
  Palette,
  PanelLeft,
  Pencil,
  RefreshCw,
  type LucideIcon
} from 'lucide-react';

import {
  getSettingsCategoryOption,
  SETTINGS_CATEGORY_GROUPS,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { cn } from '@/shared/lib/utils';
import { AppButton, AppPanel } from '@/shared/ui';

const CATEGORY_ICONS: Record<SettingsCategoryId, LucideIcon> = {
  about: Info,
  appearance: Palette,
  editor: Pencil,
  'web-lookup': Globe2,
  review: ListChecks,
  rail: PanelLeft,
  hotkeys: Keyboard,
  'mouse-gestures': MousePointer2,
  library: Library,
  'companion-sync': RefreshCw,
  backups: Archive,
  import: FolderOpen,
  'external-search': FolderSearch,
  'readwise-reader': BookOpenText
};

export function SettingsSidebar(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <AppPanel
      as="aside"
      ariaLabel="Settings categories"
      bodyClassName="px-4 pb-5 pt-4"
      className="border-r border-settings-divider"
      headerClassName="sr-only"
      surfaceClassName="bg-settings-sidebar"
      title={<span>Settings</span>}
    >
      <nav aria-label="Settings navigation" className="flex flex-col gap-4">
        {SETTINGS_CATEGORY_GROUPS.map((group) => (
          <SettingsSidebarGroup
            activeCategory={props.activeCategory}
            group={group}
            key={group.label}
            setActiveCategory={props.setActiveCategory}
          />
        ))}
      </nav>
    </AppPanel>
  );
}

function SettingsSidebarGroup(props: {
  activeCategory: SettingsCategoryId;
  group: (typeof SETTINGS_CATEGORY_GROUPS)[number];
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <div className="border-t border-settings-divider/55 pt-4 first:border-t-0 first:pt-0">
      <div className="mb-1 px-3 text-[0.72rem] font-semibold leading-5 text-foreground/55">{props.group.label}</div>
      <div className="flex flex-col gap-0.5">
        {props.group.categoryIds.map((categoryId) => {
          const category = getSettingsCategoryOption(categoryId);
          return category ? (
            <SettingsSidebarItem
              active={category.id === props.activeCategory}
              category={category}
              key={category.id}
              onSelect={props.setActiveCategory}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

function SettingsSidebarItem(props: {
  active: boolean;
  category: NonNullable<ReturnType<typeof getSettingsCategoryOption>>;
  onSelect: (category: SettingsCategoryId) => void;
}) {
  const Icon = CATEGORY_ICONS[props.category.id];
  return (
    <AppButton
      aria-current={props.active ? 'page' : undefined}
      className={cn(
        'min-h-0 cursor-pointer gap-2.5 rounded-md border px-3 py-[7px] text-[0.9rem] leading-5 transition-colors',
        props.active
          ? 'border-transparent bg-settings-selected font-semibold text-foreground'
          : 'border-transparent bg-transparent text-foreground/70 hover:bg-settings-selected hover:text-foreground active:bg-settings-control-active'
      )}
      onClick={() => props.onSelect(props.category.id)}
      variant="list"
    >
      <Icon
        aria-hidden
        className={cn('size-4 shrink-0', props.active ? 'text-settings-icon-active' : 'text-settings-icon')}
        strokeWidth={1.8}
      />
      <span className="min-w-0 truncate">{props.category.label}</span>
    </AppButton>
  );
}
