import { useState, type CSSProperties, type ReactNode } from 'react';

import {
  AIDE_READ_BUDGET_MAX,
  AIDE_READ_BUDGET_MIN,
  createDefaultAideToolPermissionSettings,
  isDefaultAideToolPermissions,
  normalizeAideReadBudget,
  type AideReadToolKey,
  type AideToolPermissionSettings,
  type AideWriteToolKey
} from '../../../../lib/core/assistant/aideToolPermissionSettings';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../../../shared/localization/translations';
import {
  AppSwitch,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../shared/ui';
import { useAideToolPermissionSettings } from '../model/useAideToolPermissionSettings';

import { AideSettingsPaneFrame } from './AideSettingsPaneFrame';

const READ_PERMISSION_ORDER: readonly AideReadToolKey[] = [
  'continueReading', 'readPdfPage', 'traceSource', 'searchCurrent', 'searchLibrary'
];

const WRITE_PERMISSION_ORDER: readonly AideWriteToolKey[] = [
  'createMaterial', 'createExcerpt', 'editContent', 'moveAndOrder', 'manageIndexes', 'manageDives', 'trash'
];

// Each column spans one track for its heading, one for its first setting, and one per switch below it.
const PERMISSION_GRID_TRACKS = {
  '--read-track-count': READ_PERMISSION_ORDER.length + 2,
  '--write-track-count': WRITE_PERMISSION_ORDER.length + 2
} as CSSProperties;
const PERMISSION_COLUMN = `min-[1080px]:row-start-1 min-[1080px]:mb-0 min-[1080px]:grid min-[1080px]:min-w-0 min-[1080px]:grid-rows-subgrid
  min-[1080px]:[&>div:last-child]:row-start-2 min-[1080px]:[&>div:last-child]:row-end-[-1]
  min-[1080px]:[&>div:last-child]:grid min-[1080px]:[&>div:last-child]:grid-rows-subgrid`;

export function AideSettingsPermissionsPane() {
  const t = useTranslation();
  const { flush, saveFailed, settings, update } = useAideToolPermissionSettings();
  const reset = () => {
    update(createDefaultAideToolPermissionSettings());
    flush();
  };
  return (
    <AideSettingsPaneFrame
      description={t('settings.aideDialog.permissions.description')}
      descriptionPosition="bottom"
      onReset={isDefaultAideToolPermissions(settings) ? undefined : reset}
      resetLabel={t('settings.aideDialog.permissions.reset')}
    >
      <div
        className="grid grid-cols-1 gap-5 pl-5 pr-5 min-[1080px]:grid-cols-2 min-[1080px]:gap-y-0 min-[1080px]:pl-0"
        style={PERMISSION_GRID_TRACKS}
      >
        <SettingsSection
          ariaLabel={t('settings.aideDialog.permissions.read.title')}
          className={`${PERMISSION_COLUMN} min-[1080px]:col-start-1 min-[1080px]:row-span-[var(--read-track-count)]`}
          title={t('settings.aideDialog.permissions.read.title')}
        >
          <AideReadPermissionRows onChange={update} onCommit={flush} settings={settings} />
        </SettingsSection>
        <SettingsSection
          ariaLabel={t('settings.aideDialog.permissions.write.title')}
          className={`${PERMISSION_COLUMN} min-[1080px]:col-start-2 min-[1080px]:row-span-[var(--write-track-count)] min-[1080px]:pt-0 min-[1080px]:before:hidden`}
          title={t('settings.aideDialog.permissions.write.title')}
        >
          <AidePermissionRow
            description={t('settings.aideDialog.permissions.askBeforeWrite.description')}
            title={t('settings.aideDialog.permissions.askBeforeWrite.title')}
          >
            <AppSwitch
              aria-label={t('settings.aideDialog.permissions.askBeforeWrite.title')}
              checked={settings.askBeforeWrite}
              onCheckedChange={(askBeforeWrite) => update({ ...settings, askBeforeWrite })}
            />
          </AidePermissionRow>
          <AidePermissionSwitches
            group="write"
            keys={WRITE_PERMISSION_ORDER}
            onChange={(write) => update({ ...settings, write })}
            values={settings.write}
          />
        </SettingsSection>
      </div>
      {saveFailed ? (
        <p className="mx-settings-panel-x mt-2 text-ui-sm text-destructive" role="alert">{t('settings.aideDialog.permissions.saveFailed')}</p>
      ) : null}
    </AideSettingsPaneFrame>
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
      <AidePermissionRow
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
      </AidePermissionRow>
      <AidePermissionSwitches
        group="read"
        keys={READ_PERMISSION_ORDER}
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
      <AidePermissionRow description={t(`${prefix}.description` as TranslationKey)} key={key} title={title}>
        <AppSwitch
          aria-label={title}
          checked={values[key]}
          onCheckedChange={(enabled) => onChange({ ...values, [key]: enabled })}
        />
      </AidePermissionRow>
    );
  });
}

function AidePermissionRow({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <SettingsRow description={description || <span aria-hidden="true">{'\u00A0'}</span>} title={title}>
      {children}
    </SettingsRow>
  );
}
