import { useEffect, useState } from 'react';

import {
  SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION,
  SYSTEM_ENTRY_IDS,
  type SystemEntryId
} from '../../../../../lib/platform/systemEntryDisplayNameContract';
import { getStoredAppLocale } from '../../../../shared/localization/appLanguage';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { useSystemEntryDisplayNamesSnapshot } from '../../../../shared/localization/systemEntryDisplayNamesStore';
import { defaultSystemEntryDisplayName } from '../../../../shared/localization/systemEntryNames';
import { saveRuntimeSystemEntryDisplayNames } from '../../../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository';
import {
  AppStatusBadge,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

type DraftNames = Partial<Record<SystemEntryId, string>>;

function errorKey(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('system_entry_display_names_upgrade_required')
    ? ('settings.general.systemEntryNames.upgradeRequired' as const)
    : ('settings.general.systemEntryNames.saveFailed' as const);
}

function useSystemEntryNameEditor(demo: boolean) {
  const t = useTranslation();
  const snapshot = useSystemEntryDisplayNamesSnapshot();
  const [drafts, setDrafts] = useState<DraftNames>(snapshot.payload.customDisplayNameById);
  const [pendingId, setPendingId] = useState<SystemEntryId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDrafts(snapshot.payload.customDisplayNameById), [snapshot.revision]);

  const saveName = async (id: SystemEntryId, rawValue: string) => {
    if (pendingId) return;
    const value = rawValue.trim();
    const previous = snapshot.payload.customDisplayNameById[id] ?? '';
    if (value === previous) {
      setDrafts((current) => ({ ...current, [id]: previous }));
      return;
    }
    const nextNames = { ...snapshot.payload.customDisplayNameById };
    if (value) nextNames[id] = value;
    else delete nextNames[id];
    setPendingId(id);
    setError(null);
    try {
      await saveRuntimeSystemEntryDisplayNames(
        {
          customDisplayNameById: nextNames,
          version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION
        },
        { demo }
      );
    } catch (saveError) {
      setDrafts(snapshot.payload.customDisplayNameById);
      setError(t(errorKey(saveError)));
    } finally {
      setPendingId(null);
    }
  };

  return { drafts, error, pendingId, saveName, setDrafts, snapshot };
}

type SystemEntryNameRowProps = ReturnType<typeof useSystemEntryNameEditor> & {
  id: SystemEntryId;
  index: number;
  searchRow: ReturnType<typeof useLocalizedSettingsSearchRow>;
};

function SystemEntryNameRow(props: SystemEntryNameRowProps) {
  const t = useTranslation();
  const locale = getStoredAppLocale();
  const defaultName = defaultSystemEntryDisplayName(locale, props.id);
  const savedName = props.snapshot.payload.customDisplayNameById[props.id] ?? '';
  const hasOverride = Boolean(savedName);
  return (
    <SettingsRow
      {...(props.index === 0 ? settingsSearchRowProps(props.searchRow) : {})}
      description={t(
        hasOverride
          ? 'settings.general.systemEntryNames.custom'
          : 'settings.general.systemEntryNames.followsLanguage'
      )}
      title={defaultName}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex w-[360px] max-w-full items-center gap-2">
          <input
            aria-label={t('settings.general.systemEntryNames.inputAria', { name: defaultName })}
            className={settingsFieldClassName()}
            disabled={props.pendingId !== null}
            onBlur={(event) => void props.saveName(props.id, event.currentTarget.value)}
            onChange={(event) =>
              props.setDrafts((current) => ({ ...current, [props.id]: event.target.value }))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                props.setDrafts((current) => ({ ...current, [props.id]: savedName }));
                event.currentTarget.blur();
              }
            }}
            placeholder={defaultName}
            value={props.drafts[props.id] ?? ''}
          />
          <SettingsButton
            disabled={!hasOverride || props.pendingId !== null}
            loading={props.pendingId === props.id}
            onClick={() => void props.saveName(props.id, '')}
          >
            {t('desktop.objectConfig.restoreDefault')}
          </SettingsButton>
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsSystemEntryNamesSection({ demo = false }: { demo?: boolean }) {
  const t = useTranslation();
  const searchRow = useLocalizedSettingsSearchRow('general-system-entry-names');
  const editor = useSystemEntryNameEditor(demo);

  return (
    <SettingsSection
      actions={editor.error ? <AppStatusBadge label={editor.error} tone="error" /> : undefined}
      ariaLabel={t('settings.general.systemEntryNames.section')}
      description={t(
        demo
          ? 'settings.general.systemEntryNames.demoDescription'
          : 'settings.general.systemEntryNames.description'
      )}
      title={t('settings.general.systemEntryNames.section')}
    >
      {SYSTEM_ENTRY_IDS.map((id, index) => (
        <SystemEntryNameRow key={id} {...editor} id={id} index={index} searchRow={searchRow} />
      ))}
    </SettingsSection>
  );
}
