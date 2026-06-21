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
    <div className="flex min-h-12 min-w-0 items-center text-ui-sm leading-5 text-red-600">
      <span className="shrink-0 font-semibold">
        {t('settings.demoPreview.banner.title')}
      </span>
      <span className="ml-2 min-w-0 truncate text-red-600/80">{t('settings.demoPreview.banner.description')}</span>
    </div>
  );
}
