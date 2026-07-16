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
  Type,
  RefreshCw,
  Send,
  SlidersHorizontal,
  type LucideIcon
} from 'lucide-react';

import folioleLeafUrl from '../../../../assets/brand/foliole-leaf-tight.svg?url';
import { definedProps } from '../../../shared/lib/definedProps';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  getSettingsCategoryOption,
  getSettingsCategoryGroups,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { cn } from '@/shared/lib/utils';
import { useAppVersion } from '@/shared/platform/appVersion';
import { AppButton, AppPanel, settingsSidebarBadgeClassName, settingsSidebarItemClassName } from '@/shared/ui';

const CATEGORY_ICONS: Record<SettingsCategoryId, LucideIcon> = {
  about: Info,
  general: SlidersHorizontal,
  appearance: Palette,
  typography: Type,
  editor: Pencil,
  'web-lookup': Globe2,
  publishing: Send,
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
  brandBadge?: string;
  hiddenCategoryIds?: SettingsCategoryId[];
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  const t = useTranslation();
  const hidden = new Set(props.hiddenCategoryIds ?? []);
  const groups = getSettingsCategoryGroups(t).map((group) => ({
    ...group,
    categoryIds: group.categoryIds.filter((categoryId) => !hidden.has(categoryId))
  }));
  const about = hidden.has('about') ? undefined : getSettingsCategoryOption('about', t);
  return (
    <AppPanel
      as="aside"
      ariaLabel={t('settings.sidebar.aria')}
      bodyClassName="px-4 pb-5 pt-3 [--app-scrollbar-thumb-color:var(--workspace-region-main-topic-scrollbar-thumb-color)] [--app-scrollbar-thumb-hover-color:var(--workspace-region-main-topic-scrollbar-thumb-hover-color)] [--app-scrollbar-track-bg:transparent]"
      className="border-r border-settings-divider"
      headerClassName="h-[64px] min-h-0 border-b border-settings-divider/55 px-5 py-0"
      scrollBody
      surfaceClassName="bg-settings-sidebar"
      title={<SettingsSidebarBrand {...definedProps({ badge: props.brandBadge })} />}
    >
      <nav aria-label={t('settings.navigation.aria')} className="flex w-full flex-col items-stretch gap-4">
        {about ? (
          <SettingsSidebarItem
            active={about.id === props.activeCategory}
            category={about}
            onSelect={props.setActiveCategory}
          />
        ) : null}
        {groups.map((group) => (
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

function SettingsSidebarBrand(props: { badge?: string }) {
  const appVersion = useAppVersion();

  return (
    <div className="flex w-[220px] min-w-0 items-center gap-3">
      <img
        alt=""
        aria-hidden="true"
        className="size-8 shrink-0 object-contain"
        src={folioleLeafUrl}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <div className="truncate text-[1.05rem] font-semibold leading-5 text-foreground">Foliole</div>
        {props.badge ? (
          <span className="shrink-0 text-ui-xs font-semibold uppercase tracking-[0.12em] text-foreground/45">
            {props.badge}
          </span>
        ) : null}
      </div>
      <span className={settingsSidebarBadgeClassName('ml-auto')}>
        v{appVersion}
      </span>
    </div>
  );
}

function SettingsSidebarGroup(props: {
  activeCategory: SettingsCategoryId;
  group: ReturnType<typeof getSettingsCategoryGroups>[number];
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  const t = useTranslation();
  return (
    <div className="relative w-full pt-4 before:absolute before:left-3 before:right-3 before:top-0 before:border-t before:border-settings-divider/65 first:pt-0 first:before:hidden">
      <div className="mb-1 flex w-full items-center gap-2 px-3 text-[0.72rem] font-semibold uppercase leading-5 tracking-[0.12em] text-foreground/58">
        <span>{props.group.label}</span>
      </div>
      <div className="flex w-full flex-col items-stretch gap-0.5">
        {props.group.categoryIds.map((categoryId) => {
          const category = getSettingsCategoryOption(categoryId, t);
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
      className={settingsSidebarItemClassName(props.active)}
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
