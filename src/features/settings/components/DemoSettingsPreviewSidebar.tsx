import {
  getSettingsCategoryGroups,
  getSettingsCategoryOption,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { useTranslation } from '@/shared/localization/LocalizationProvider';
import {
  AppButton,
  AppPanel,
  settingsSidebarItemClassName
} from '@/shared/ui';

export function DemoSettingsPreviewSidebar(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  const t = useTranslation();
  const groups = getSettingsCategoryGroups(t);
  const about = getSettingsCategoryOption('about', t);
  return (
    <AppPanel
      as="aside"
      ariaLabel={t('settings.sidebar.aria')}
      bodyClassName="px-4 pb-5 pt-3"
      className="border-r border-settings-divider"
      headerClassName="min-h-[64px] border-b border-settings-divider/55 px-5 py-3"
      surfaceClassName="bg-settings-sidebar"
      title={<div className="text-[1.05rem] font-semibold leading-5 text-foreground">Foliole</div>}
    >
      <nav aria-label={t('settings.navigation.aria')} className="flex flex-col gap-4">
        {about ? (
          <AppButton
            active={props.activeCategory === about.id}
            className={settingsSidebarItemClassName(props.activeCategory === about.id)}
            onClick={() => props.setActiveCategory(about.id)}
            variant="list"
          >
            <span className="min-w-0 truncate">{about.label}</span>
          </AppButton>
        ) : null}
        {groups.map((group) => (
          <DemoSettingsPreviewSidebarGroup
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

function DemoSettingsPreviewSidebarGroup(props: {
  activeCategory: SettingsCategoryId;
  group: ReturnType<typeof getSettingsCategoryGroups>[number];
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  const t = useTranslation();
  return (
    <div className="relative pt-4 before:absolute before:left-3 before:right-3 before:top-0 before:border-t before:border-settings-divider/65 first:pt-0 first:before:hidden">
      <div className="mb-1 px-3 text-[0.72rem] font-semibold uppercase leading-5 tracking-[0.12em] text-foreground/58">
        {props.group.label}
      </div>
      {props.group.categoryIds.map((categoryId) => {
        const category = getSettingsCategoryOption(categoryId, t);
        if (!category) return null;
        return (
          <AppButton
            active={props.activeCategory === category.id}
            className={settingsSidebarItemClassName(props.activeCategory === category.id)}
            key={category.id}
            onClick={() => props.setActiveCategory(category.id)}
            variant="list"
          >
            <span className="min-w-0 truncate">{category.label}</span>
          </AppButton>
        );
      })}
    </div>
  );
}
