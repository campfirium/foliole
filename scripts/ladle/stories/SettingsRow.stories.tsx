import type { Story } from '@ladle/react';
import { useState } from 'react';

import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from '../../../lib/core/review/unifiedPushQueueRules';
import { ReviewNumberInput } from '../../../src/features/settings/components/sections/reviewSettingsControls';
import { EN_SETTINGS_TRANSLATIONS } from '../../../src/shared/localization/locales/enSettings';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../../src/shared/ui';
import { settingsDialogPane, settingsDialogPaneBody } from '../../../src/shared/ui/settingsDialogBounds';

interface PriorityWeightProps {
  title: string;
  description: string;
  weight: number;
  disabled: boolean;
}

const defaultArgs: PriorityWeightProps = {
  title: EN_SETTINGS_TRANSLATIONS['settings.scheduling.priorityTitle'],
  description: EN_SETTINGS_TRANSLATIONS['settings.scheduling.prioritySearch'],
  weight: DEFAULT_UNIFIED_PUSH_QUEUE_RULES.priorityRatio,
  disabled: false
};

function PriorityWeightRow({ title, description, weight, disabled }: PriorityWeightProps) {
  const [value, setValue] = useState(weight);

  return (
    <div className={settingsDialogPane} style={{ maxWidth: '980px' }}>
      <div className={settingsDialogPaneBody}>
        <SettingsSection title={EN_SETTINGS_TRANSLATIONS['settings.scheduling.title']}>
          <SettingsRow title={title} description={description}>
            <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
              <fieldset className="contents" disabled={disabled}>
                <ReviewNumberInput ariaLabel={title} min={1} step={0.1} value={value} onChange={setValue} />
              </fieldset>
            </SettingsControlSlot>
          </SettingsRow>
        </SettingsSection>
      </div>
    </div>
  );
}

export const PriorityWeight: Story<PriorityWeightProps> = (props) => <PriorityWeightRow key={props.weight} {...props} />;
PriorityWeight.args = defaultArgs;

export const LongCopy: Story<PriorityWeightProps> = (props) => <PriorityWeightRow key={props.weight} {...props} />;
LongCopy.args = {
  ...defaultArgs,
  description: 'When P1 and P9 both have due items, this weight gives the P1 queue five times the chance of being selected next. Empty queues are skipped, and due P0 items go first.'
};

export const Disabled: Story<PriorityWeightProps> = (props) => <PriorityWeightRow key={props.weight} {...props} />;
Disabled.args = { ...defaultArgs, disabled: true };
