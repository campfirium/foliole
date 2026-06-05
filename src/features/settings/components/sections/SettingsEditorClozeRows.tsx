import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppInput,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSegmentedControl
} from '../../../../shared/ui';
import {
  DEFAULT_LONG_CLOZE_FRONT_GUARD_MODE,
  getLongClozeFrontGuardThreshold,
  getLongClozeFrontGuardMode,
  getLongClozeSelectionGuardMin,
  setLongClozeFrontGuardMode,
  setLongClozeFrontGuardThreshold,
  setLongClozeSelectionGuardMin
} from '../../../editor/model/longClozeFrontGuardSetting';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { createSettingsSearchRows } from '../../model/settingsSearchRowCatalog';

function useEditorSettingsRow(id: string) {
  const t = useTranslation();
  const row = createSettingsSearchRows(t).find((item) => item.id === id);
  if (!row) throw new Error(`Missing editor settings search row: ${id}`);
  return row;
}

export function LongClozeFrontGuardRow() {
  const t = useTranslation();
  const row = useEditorSettingsRow('editor-long-cloze-mistake-guard');
  const [mode, setMode] = useState(() => getLongClozeFrontGuardMode());
  return (
    <SettingsRow
      {...settingsSearchRowProps(row)}
      description={row.description}
      title={row.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsSegmentedControl
          ariaLabel={t('settings.editor.clozeGuard.actionAria')}
          onChange={(value) => setMode(setLongClozeFrontGuardMode(value))}
          options={[
            { label: t('settings.editor.clozeGuard.remind'), value: DEFAULT_LONG_CLOZE_FRONT_GUARD_MODE },
            { label: t('settings.editor.clozeGuard.convert'), value: 'convert' },
            { label: t('settings.editor.clozeGuard.off'), value: 'off' }
          ]}
          value={mode}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function ClozeSelectedTextLimitRow() {
  const t = useTranslation();
  const [selectionMin, setSelectionMin] = useState(() => getLongClozeSelectionGuardMin());
  return (
    <SettingsRow
      description={t('settings.editor.clozeGuard.selectionDescription')}
      title={t('settings.editor.clozeGuard.selectionTitle')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppInput
          aria-label={t('settings.editor.clozeGuard.selectionAria')}
          className="h-9 w-28"
          min={0}
          onChange={(event) => setSelectionMin(setLongClozeSelectionGuardMin(event.target.value))}
          type="number"
          value={selectionMin}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function ClozeFrontLengthLimitRow() {
  const t = useTranslation();
  const [frontMax, setFrontMax] = useState(() => getLongClozeFrontGuardThreshold());
  return (
    <SettingsRow
      description={t('settings.editor.clozeGuard.frontDescription')}
      title={t('settings.editor.clozeGuard.frontTitle')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppInput
          aria-label={t('settings.editor.clozeGuard.frontAria')}
          className="h-9 w-28"
          min={50}
          onChange={(event) => setFrontMax(setLongClozeFrontGuardThreshold(event.target.value))}
          type="number"
          value={frontMax}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}
