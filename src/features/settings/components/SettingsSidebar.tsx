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
  MoreHorizontal,
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
import { AppButton, SettingsNavigation, SettingsNavigationBrand, SettingsNavigationGroup, settingsSidebarItemClassName } from '@/shared/ui';

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
  'document-menu': MoreHorizontal,
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
    <SettingsNavigation
      ariaLabel={t('settings.sidebar.aria')}
      navigationLabel={t('settings.navigation.aria')}
      title={<SettingsSidebarBrand {...definedProps({ badge: props.brandBadge })} />}
    >
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
    </SettingsNavigation>
  );
}

function SettingsSidebarBrand(props: { badge?: string }) {
  const appVersion = useAppVersion();

  return (
    <SettingsNavigationBrand
      {...definedProps({ badge: props.badge })}
      logo={(
        <img
          alt=""
          aria-hidden="true"
          className="size-8 shrink-0 object-contain"
          src={folioleLeafUrl}
        />
      )}
      name="Foliole"
      version={<>v{appVersion}</>}
    />
  );
}

function SettingsSidebarGroup(props: {
  activeCategory: SettingsCategoryId;
  group: ReturnType<typeof getSettingsCategoryGroups>[number];
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  const t = useTranslation();
  return (
    <SettingsNavigationGroup title={props.group.label}>
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
    </SettingsNavigationGroup>
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
