import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import {
  AppInput,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedControl,
  settingsResetButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { FRONTMATTER_META_FIELDS_DEFAULT } from '../../../editor/model/frontmatterMetaFieldsSetting';
import {
  DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX,
  getHighlightAnnotationPrefix,
  setHighlightAnnotationPrefix
} from '../../../editor/model/highlightAnnotationPrefixSetting';
import {
  DEFAULT_LONG_CLOZE_FRONT_GUARD_MODE,
  getLongClozeFrontGuardThreshold,
  getLongClozeFrontGuardMode,
  getLongClozeSelectionGuardMin,
  setLongClozeFrontGuardMode,
  setLongClozeFrontGuardThreshold,
  setLongClozeSelectionGuardMin
} from '../../../editor/model/longClozeFrontGuardSetting';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

function HighlightAnnotationPrefixRow() {
  const [prefix, setPrefix] = useState(() => getHighlightAnnotationPrefix());
  const updatePrefix = (value: string) => {
    setPrefix(setHighlightAnnotationPrefix(value));
  };

  return (
    <SettingsRow
      description="Inserted before annotation text when creating or adding a highlight annotation."
      title="Highlight annotation prefix"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label="Reset highlight annotation prefix"
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={prefix === DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX}
            onClick={() => updatePrefix(DEFAULT_HIGHLIGHT_ANNOTATION_PREFIX)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label="Highlight annotation prefix"
            className={SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME}
            maxLength={24}
            onChange={(event) => updatePrefix(event.target.value)}
            value={prefix}
          />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function LongClozeFrontGuardRow() {
  const [mode, setMode] = useState(() => getLongClozeFrontGuardMode());
  return (
    <SettingsRow
      description="When both length checks are exceeded, ask first, create a highlight, or allow the cloze."
      title="Long cloze mistake guard"
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

function ClozeSelectedTextLimitRow() {
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

function ClozeFrontLengthLimitRow() {
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

function FrontmatterMetaFieldsRow() {
  const {
    frontmatterMetaFields,
    resetFrontmatterMetaFields,
    setFrontmatterMetaFields
  } = useAppearanceSettings();

  return (
    <SettingsRow
      description="Fields shown under the title. Use commas for groups and | for aliases, such as author|byline, url|link|source."
      title="Frontmatter meta"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <div className="flex items-center gap-2">
          <button
            aria-label="Reset frontmatter meta fields"
            className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')}
            disabled={frontmatterMetaFields === FRONTMATTER_META_FIELDS_DEFAULT}
            onClick={resetFrontmatterMetaFields}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <AppInput
            aria-label="Frontmatter meta fields"
            className="h-9 w-[22rem]"
            onChange={(event) => setFrontmatterMetaFields(event.target.value)}
            value={frontmatterMetaFields}
          />
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsEditorSection() {
  const {
    autoLocalizeRemoteImages,
    markdownSyntaxVisibility,
    setAutoLocalizeRemoteImages,
    setMarkdownSyntaxVisibility
  } = useAppearanceSettings();

  return (
    <>
      <SettingsSection ariaLabel="Editor settings section" title="Live markdown">
        <SettingsRow
          description="Automatically copy remote pictures in topics into your local library so they stay available offline."
          title="Save remote images locally"
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <button
              aria-checked={autoLocalizeRemoteImages}
              aria-label="Save remote images locally"
              className={settingsSwitchClassName(autoLocalizeRemoteImages)}
              onClick={() => setAutoLocalizeRemoteImages(!autoLocalizeRemoteImages)}
              role="switch"
              type="button"
            >
              <span
                aria-hidden="true"
                className={settingsSwitchKnobClassName(autoLocalizeRemoteImages)}
              />
            </button>
          </SettingsControlSlot>
        </SettingsRow>
        <SettingsRow
          description="Show markdown syntax markers on the active line, or keep them hidden everywhere."
          title="Show markdown syntax markers"
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <SettingsSegmentedControl
              ariaLabel="Markdown syntax visibility"
              onChange={(value) => setMarkdownSyntaxVisibility(value as typeof markdownSyntaxVisibility)}
              options={[
                { label: 'Hidden', value: 'hidden' },
                { label: 'Active line', value: 'visible' }
              ]}
              value={markdownSyntaxVisibility}
            />
          </SettingsControlSlot>
        </SettingsRow>
        <FrontmatterMetaFieldsRow />
      </SettingsSection>
      <SettingsSection ariaLabel="Cloze guard settings section" title="Cloze guard">
        <LongClozeFrontGuardRow />
        <ClozeSelectedTextLimitRow />
        <ClozeFrontLengthLimitRow />
      </SettingsSection>
      <SettingsSection ariaLabel="Annotation settings section" title="Annotations">
        <HighlightAnnotationPrefixRow />
      </SettingsSection>
    </>
  );
}
