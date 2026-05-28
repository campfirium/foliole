import { useState } from 'react';

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
import { EDITOR_SETTINGS_SEARCH_ROWS } from '../../model/settingsSearchRowCatalog';

function getEditorSettingsRow(id: string) {
  const row = EDITOR_SETTINGS_SEARCH_ROWS.find((item) => item.id === id);
  if (!row) throw new Error(`Missing editor settings search row: ${id}`);
  return row;
}

const LONG_CLOZE_MISTAKE_GUARD_ROW = getEditorSettingsRow('editor-long-cloze-mistake-guard');

export function LongClozeFrontGuardRow() {
  const [mode, setMode] = useState(() => getLongClozeFrontGuardMode());
  return (
    <SettingsRow
      {...settingsSearchRowProps(LONG_CLOZE_MISTAKE_GUARD_ROW)}
      description={LONG_CLOZE_MISTAKE_GUARD_ROW.description}
      title={LONG_CLOZE_MISTAKE_GUARD_ROW.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsSegmentedControl
          ariaLabel="Long cloze action"
          onChange={(value) => setMode(setLongClozeFrontGuardMode(value))}
          options={[
            { label: 'Remind', value: DEFAULT_LONG_CLOZE_FRONT_GUARD_MODE },
            { label: 'Convert', value: 'convert' },
            { label: 'Off', value: 'off' }
          ]}
          value={mode}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function ClozeSelectedTextLimitRow() {
  const [selectionMin, setSelectionMin] = useState(() => getLongClozeSelectionGuardMin());
  return (
    <SettingsRow
      description="Selections at or below this length create clozes normally. Use 0 to check every selection."
      title="Only check when selected answer is longer than"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppInput
          aria-label="Cloze guard selected text limit"
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
  const [frontMax, setFrontMax] = useState(() => getLongClozeFrontGuardThreshold());
  return (
    <SettingsRow
      description="The front is the topic text after the selected answer is replaced with the cloze placeholder."
      title="Then guard when generated card front is longer than"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppInput
          aria-label="Cloze guard front length limit"
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
