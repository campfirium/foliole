import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SettingsCategoryId } from '../model/settingsPanelOptions';

import { SettingsPanel } from './SettingsPanel';

import { useTranslation } from '@/shared/localization/LocalizationProvider';

export interface DemoSettingsPreviewOverlayProps {
  onClose: () => void;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  readwiseReaderCategoryContent?: ReactNode;
  requestedCategory: SettingsCategoryId | null;
}

export function DemoSettingsPreviewOverlay({
  onClose,
  onRunSupportCommand,
  readwiseReaderCategoryContent,
  requestedCategory
}: DemoSettingsPreviewOverlayProps) {
  return (
    <SettingsPanel
      contentNotice={<DemoSettingsPreviewNotice />}
      hideLanguageSetting
      onClose={onClose}
      onRunSupportCommand={onRunSupportCommand}
      previewDesktopSettings
      readwiseReaderCategoryContent={readwiseReaderCategoryContent}
      requestedCategory={requestedCategory}
    />
  );
}

function DemoSettingsPreviewNotice() {
  const t = useTranslation();
  return (
    <div className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-3 rounded-md border border-[color:color-mix(in_srgb,var(--app-accent-color)_30%,var(--app-settings-group-bg)_70%)] bg-[color:color-mix(in_srgb,var(--app-accent-color)_10%,var(--app-settings-group-bg)_90%)] px-3.5 py-3 text-ui-md leading-6 text-foreground/62">
      <Info aria-hidden className="mt-0.5 size-[18px] text-[color:var(--app-accent-color)]" strokeWidth={1.9} />
      <div className="min-w-0">
        <div className="font-semibold text-foreground/86">{t('settings.demoPreview.banner.title')}</div>
        <div>{t('settings.demoPreview.banner.description')}</div>
      </div>
    </div>
  );
}
