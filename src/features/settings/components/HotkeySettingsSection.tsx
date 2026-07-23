import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsSection } from '../../../shared/ui';
import type { HotkeySettingItem, HotkeyUpdateResult } from '../model/hotkeySettings';

import { HotkeyList } from './HotkeySettingsList';
import { HotkeySearchPanel } from './HotkeySettingsSearchPanel';
import { useHotkeySectionModel } from './HotkeySettingsSectionModel';
import { useGlobalCaptureHotkeyItems } from './useGlobalCaptureHotkeyItems';

interface HotkeySettingsSectionProps {
  items: HotkeySettingItem[];
  onRequestedCommandConsumed: () => void;
  onUpdate: (commandId: string, slot: 'primary' | 'secondary', nextLabel: string) => HotkeyUpdateResult;
  onReset: (commandId: string) => void;
  onResetAll: () => void;
  requestedCommandId: string | null;
}

export function HotkeySettingsSection({ items, onRequestedCommandConsumed, onUpdate, requestedCommandId }: HotkeySettingsSectionProps) {
  const t = useTranslation();
  const model = useHotkeySectionModel(useGlobalCaptureHotkeyItems(items), onUpdate, {
    commandId: requestedCommandId,
    onConsumed: onRequestedCommandConsumed
  });
  return (
    <SettingsSection ariaLabel={t('settings.hotkeys.sectionAria')}>
      <div className="bg-settings-group">
        <HotkeySearchPanel
          count={model.filteredItems.length}
          filterMode={model.filterMode}
          onBeginSearchRecording={model.beginSearchRecording}
          onFilterModeChange={model.setFilterMode}
          onQueryChange={model.setQuery}
          query={model.query}
          searchRecording={Boolean(model.searchRecording)}
        />
        <HotkeyList items={model.filteredItems} model={model} />
      </div>
    </SettingsSection>
  );
}
