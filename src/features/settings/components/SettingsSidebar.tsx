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

import folioleAppIconUrl from '../../../../assets/brand/foliole-app-icon.png?url';
import {
  getSettingsCategoryOption,
  SETTINGS_CATEGORY_GROUPS,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { cn } from '@/shared/lib/utils';
import { useAppVersion } from '@/shared/platform/appVersion';
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
      bodyClassName="px-4 pb-5 pt-3"
      className="border-r border-settings-divider"
      headerClassName="min-h-[64px] border-b border-settings-divider/55 px-5 py-3"
      surfaceClassName="bg-settings-sidebar"
      title={<SettingsSidebarBrand />}
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

function SettingsSidebarBrand() {
  const appVersion = useAppVersion();

  return (
    <div className="flex w-[220px] min-w-0 items-center gap-3">
      <img
        alt=""
        aria-hidden="true"
        className="size-8 shrink-0 object-contain"
        src={folioleAppIconUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[1.05rem] font-semibold leading-5 text-foreground">Foliole</div>
      </div>
      <span className="ml-auto shrink-0 rounded-md border border-settings-control-border bg-settings-control px-2 py-0.5 text-[0.72rem] font-medium leading-5 text-foreground/62">
        v{appVersion}
      </span>
    </div>
  );
}

function SettingsSidebarGroup(props: {
  activeCategory: SettingsCategoryId;
  group: (typeof SETTINGS_CATEGORY_GROUPS)[number];
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <div className="border-t border-settings-divider/65 pt-4 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center gap-2 px-3 text-[0.72rem] font-semibold uppercase leading-5 tracking-[0.12em] text-foreground/58">
        <span>{props.group.label}</span>
        <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-settings-divider/55" />
      </div>
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
