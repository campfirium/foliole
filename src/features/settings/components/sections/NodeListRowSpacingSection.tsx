import { useState } from 'react';

import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, SettingsSection, settingsFieldClassName } from '../../../../shared/ui';
import {
  DEFAULT_NODE_LIST_ROW_SPACING,
  getNodeListRowSpacing,
  setNodeListRowSpacing
} from '../../../nodes/components/nodeListRowSpacingSettings';

export function NodeListRowSpacingSection() {
  const [rowSpacing, setRowSpacing] = useState(() => getNodeListRowSpacing());

  return (
    <SettingsSection ariaLabel="Node list row spacing settings section" title="Node list">
      <SettingsRow
        description={`Set node list row spacing in pixels. The default is ${DEFAULT_NODE_LIST_ROW_SPACING}px.`}
        title="Row spacing"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <label className="inline-flex items-center gap-2">
            <span className="sr-only">Node list row spacing</span>
            <input
              aria-label="Node list row spacing"
              className={settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
              min={0}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setRowSpacing(nextValue);
                setNodeListRowSpacing(nextValue);
              }}
              step={1}
              type="number"
              value={rowSpacing}
            />
            <span className="text-sm text-foreground/65">px</span>
          </label>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
