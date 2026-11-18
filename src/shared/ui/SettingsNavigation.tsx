import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { AppButton } from './Button';
import { AppPanel } from './Panel';
import { settingsSidebarBadgeClassName, settingsSidebarItemClassName } from './SettingsLayout';

import { cn } from '@/shared/lib/utils';

interface SettingsNavigationProps {
  alignTitleWithItems?: boolean;
  ariaLabel: string;
  children: ReactNode;
  navigationLabel: string;
  title: ReactNode;
}

export function SettingsNavigation({ alignTitleWithItems, ariaLabel, children, navigationLabel, title }: SettingsNavigationProps) {
  return (
    <AppPanel
      as="aside"
      ariaLabel={ariaLabel}
      bodyClassName="px-4 pb-5 pt-3 [--app-scrollbar-thumb-color:var(--role-list-scrollbar)] [--app-scrollbar-thumb-hover-color:var(--role-list-scrollbar-hover)] [--app-scrollbar-track-bg:transparent]"
      className="border-r border-settings-divider"
      headerClassName={cn('h-settings-navigation-header min-h-0 border-b border-settings-divider/55 py-0',
        alignTitleWithItems ? 'px-4' : 'px-5')}
      scrollBody
      surfaceClassName="bg-settings-sidebar"
      title={alignTitleWithItems ? (
        // Match the row border, padding, icon width and gap inside the navigation inset.
        <div className="pl-[calc(var(--spacing)*9+1px)]">{title}</div>
      ) : title}
    >
      <nav aria-label={navigationLabel} className="flex w-full flex-col items-stretch gap-4">
        {children}
      </nav>
    </AppPanel>
  );
}

export function SettingsNavigationGroup({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return (
    <div className="relative w-full pt-4 before:absolute before:left-3 before:right-3 before:top-0 before:border-t before:border-settings-divider/65 first:pt-0 first:before:hidden">
      {title !== undefined ? <div className="mb-1 flex w-full items-center gap-2 px-3 text-settings-navigation-group font-semibold uppercase leading-5 tracking-[0.12em] text-foreground/58">
        <span>{title}</span>
      </div> : null}
      <div className="flex w-full flex-col items-stretch gap-0.5">{children}</div>
    </div>
  );
}

export function SettingsNavigationItem({ icon: Icon, current, disabled, children, onClick }: {
  icon: LucideIcon;
  current?: 'page' | 'step' | undefined;
  disabled?: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <AppButton variant="list" aria-current={current} disabled={disabled === true}
      className={settingsSidebarItemClassName(Boolean(current))} onClick={onClick}>
      <Icon aria-hidden className={cn('size-4 shrink-0', current ? 'text-settings-icon-active' : 'text-settings-icon')}
        strokeWidth={1.8} />
      <span className="min-w-0 truncate">{children}</span>
    </AppButton>
  );
}

export function SettingsNavigationBrand({ badge, logo, name, version }: {
  badge?: string;
  logo: ReactNode;
  name: ReactNode;
  version: ReactNode;
}) {
  return (
    <div className="flex w-settings-navigation-brand min-w-0 items-center gap-3">
      {logo}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <div className="truncate text-settings-brand font-semibold leading-5 text-foreground">{name}</div>
        {badge ? (
          <span className="shrink-0 text-ui-xs font-semibold uppercase tracking-[0.12em] text-foreground/45">
            {badge}
          </span>
        ) : null}
      </div>
      <span className={settingsSidebarBadgeClassName('ml-auto')}>{version}</span>
    </div>
  );
}
