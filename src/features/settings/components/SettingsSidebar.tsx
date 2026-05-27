import {
  getSettingsCategoryOption,
  SETTINGS_CATEGORY_GROUPS,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { cn } from '@/shared/lib/utils';
import { AppButton, AppPanel } from '@/shared/ui';

export function SettingsSidebar(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  return (
    <AppPanel
      as="aside"
      ariaLabel="Settings categories"
      bodyClassName="px-4 pb-5 pt-5"
      className="border-r border-settings-divider"
      headerClassName="sr-only"
      surfaceClassName="bg-settings-sidebar"
      title={<span>Settings</span>}
    >
      <nav aria-label="Settings navigation" className="flex flex-col gap-5">
        {SETTINGS_CATEGORY_GROUPS.map((group) => (
          <div className="space-y-1" key={group.label}>
            <div className="px-5 text-[0.78rem] font-semibold text-foreground/45">{group.label}</div>
            <div className="flex flex-col gap-1">
              {group.categoryIds.map((categoryId) => {
                const category = getSettingsCategoryOption(categoryId);
                return category ? (
                  <AppButton
                    aria-current={category.id === props.activeCategory ? 'page' : undefined}
                    className={cn(
                      'min-h-0 cursor-pointer rounded-md px-5 py-[10px] text-[0.98rem] transition-colors',
                      category.id === props.activeCategory
                        ? 'bg-settings-selected font-medium text-foreground'
                        : 'border-transparent bg-transparent text-foreground/72 hover:bg-settings-selected hover:text-foreground active:bg-settings-control-active'
                    )}
                    key={category.id}
                    onClick={() => props.setActiveCategory(category.id)}
                    variant="list"
                  >
                    {category.label}
                  </AppButton>
                ) : null;
              })}
            </div>
          </div>
        ))}
      </nav>
    </AppPanel>
  );
}
