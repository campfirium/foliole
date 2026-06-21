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
      headerNotice={<DemoSettingsPreviewNotice />}
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
    <div className="flex min-h-12 min-w-0 items-center gap-2 text-ui-md leading-6">
      <span className="shrink-0 font-semibold text-foreground/72">
        {t('settings.demoPreview.banner.title')}
      </span>
      <span className="min-w-0 truncate text-foreground/58">{t('settings.demoPreview.banner.description')}</span>
    </div>
  );
}
