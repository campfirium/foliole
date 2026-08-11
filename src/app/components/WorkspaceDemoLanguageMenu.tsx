import { Globe2 } from 'lucide-react';
import { useState } from 'react';

import { APP_LANGUAGE_OPTIONS } from '../../shared/localization/appLanguage';
import { useLocalization, useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuLabel,
  AppDropdownMenuTrigger,
  AppIconButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

import { WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME } from './WorkspaceRailTooltipButton';

const BUTTON_CLASS_NAME =
  `size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground ${WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME}`;

export function WorkspaceDemoLanguageMenu() {
  const t = useTranslation();
  const { languagePreference, setLanguagePreference } = useLocalization();
  const label = t('settings.general.language.aria');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-[var(--workspace-top-toolbar-height)] items-center justify-center">
      <AppDropdownMenu onOpenChange={setOpen} open={open}>
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <AppDropdownMenuTrigger asChild>
              <AppIconButton
                className={BUTTON_CLASS_NAME}
                focusRing="none"
                icon={<Globe2 aria-hidden="true" size={16} strokeWidth={1.75} />}
                label={label}
                onClick={() => setOpen(true)}
              />
            </AppDropdownMenuTrigger>
          </AppTooltipTrigger>
          <AppTooltipContent side="right" sideOffset={8}>{label}</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenuContent align="start" side="right" sideOffset={8}>
          <AppDropdownMenuLabel>{label}</AppDropdownMenuLabel>
          <AppDropdownMenuCheckItem
            checked={languagePreference === 'system'}
            onSelect={() => setLanguagePreference('system')}
          >
            System
          </AppDropdownMenuCheckItem>
          {APP_LANGUAGE_OPTIONS.map((option) => (
            <AppDropdownMenuCheckItem
              checked={languagePreference === option.value}
              key={option.value}
              onSelect={() => setLanguagePreference(option.value)}
            >
              {option.label}
            </AppDropdownMenuCheckItem>
          ))}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </div>
  );
}
