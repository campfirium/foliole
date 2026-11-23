import { useState } from 'react';

import {
  AIDE_READ_BUDGET_MAX,
  AIDE_READ_BUDGET_MIN,
  AIDE_READ_TOOL_KEYS,
  AIDE_WRITE_TOOL_KEYS,
  createDefaultAideToolPermissionSettings,
  isDefaultAideToolPermissions,
  normalizeAideReadBudget,
  type AideToolPermissionSettings
} from '../../../../lib/core/assistant/aideToolPermissionSettings';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../shared/localization/translations';
import {
  AppDialogDescription,
  AppSwitch,
  SettingsButton,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../shared/ui';
import { useAideToolPermissionSettings } from '../model/useAideToolPermissionSettings';

export function AideSettingsPermissionsPane() {
  const t = useTranslation();
  const { flush, saveFailed, settings, update } = useAideToolPermissionSettings();
  const reset = () => {
    update(createDefaultAideToolPermissionSettings());
    flush();
  };
  return (
    <>
      <div className="mb-7 flex items-start justify-between gap-6 px-5 pb-6">
        <div>
          <h2 className="m-0 text-xl font-semibold text-foreground">{t('settings.aideDialog.permissions.nav')}</h2>
          <AppDialogDescription className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground" id="aide-settings-description">
            {t('settings.aideDialog.permissions.description')}
          </AppDialogDescription>
        </div>
        {isDefaultAideToolPermissions(settings) ? null : (
          <SettingsButton onClick={reset}>{t('settings.aideDialog.permissions.reset')}</SettingsButton>
        )}
      </div>
      <div className="grid grid-cols-2 items-start gap-5 pr-5 max-[1080px]:grid-cols-1 max-[1080px]:pl-5">
        <SettingsSection
          ariaLabel={t('settings.aideDialog.permissions.read.title')}
          description={t('settings.aideDialog.permissions.read.description')}
          title={t('settings.aideDialog.permissions.read.title')}
        >
          <AideReadPermissionRows onChange={update} onCommit={flush} settings={settings} />
          {saveFailed ? (
            <p className="mx-settings-panel-x mt-2 text-ui-sm text-destructive" role="alert">{t('settings.aideDialog.permissions.saveFailed')}</p>
          ) : null}
        </SettingsSection>
        <SettingsSection
          ariaLabel={t('settings.aideDialog.permissions.write.title')}
          // Side by side with the read section, so it starts level with it; stacked, it keeps its divider.
          className="min-[1080px]:pt-0 min-[1080px]:before:hidden"
          description={t('settings.aideDialog.permissions.write.description')}
          title={t('settings.aideDialog.permissions.write.title')}
        >
          <AidePermissionSwitches
            group="write"
            keys={AIDE_WRITE_TOOL_KEYS}
            onChange={(write) => update({ ...settings, write })}
            values={settings.write}
          />
        </SettingsSection>
      </div>
    </>
  );
}

function AideReadPermissionRows({ onChange, onCommit, settings }: {
  onChange: (settings: AideToolPermissionSettings) => void;
  onCommit: () => void;
  settings: AideToolPermissionSettings;
}) {
  const t = useTranslation();
  // The typed text is kept until blur so a half-typed number is not snapped to the minimum.
  const [draft, setDraft] = useState<string | null>(null);
  const commitBudget = () => {
    if (draft !== null) onChange({ ...settings, readBudget: normalizeAideReadBudget(Number.parseInt(draft, 10)) });
    setDraft(null);
    onCommit();
  };
  return (
    <>
      <SettingsRow
        description={t('settings.aideDialog.permissions.readBudget.description')}
        title={t('settings.aideDialog.permissions.readBudget.title')}
      >
        <input
          aria-label={t('settings.aideDialog.permissions.readBudget.title')}
          className={settingsFieldClassName('w-28 tabular-nums')}
          inputMode="numeric"
          max={AIDE_READ_BUDGET_MAX}
          min={AIDE_READ_BUDGET_MIN}
          onBlur={commitBudget}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') commitBudget(); }}
          step={1000}
          type="number"
          value={draft ?? settings.readBudget}
        />
      </SettingsRow>
      <AidePermissionSwitches
        group="read"
        keys={AIDE_READ_TOOL_KEYS}
        onChange={(read) => onChange({ ...settings, read })}
        values={settings.read}
      />
    </>
  );
}

function AidePermissionSwitches<K extends string>({ group, keys, onChange, values }: {
  group: 'read' | 'write';
  keys: readonly K[];
  onChange: (values: Record<K, boolean>) => void;
  values: Record<K, boolean>;
}) {
  const t = useTranslation();
  return keys.map((key) => {
    const prefix = `settings.aideDialog.permissions.${group === 'read' ? 'tool' : 'write'}.${key}`;
    const title = t(`${prefix}.title` as TranslationKey);
    return (
      <SettingsRow description={t(`${prefix}.description` as TranslationKey)} key={key} title={title}>
        <AppSwitch
          aria-label={title}
          checked={values[key]}
          onCheckedChange={(enabled) => onChange({ ...values, [key]: enabled })}
        />
      </SettingsRow>
    );
  });
}
