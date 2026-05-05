import { useState } from 'react';

import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import {
  DEFAULT_NODE_LIST_ROW_SPACING,
  getNodeListRowSpacing,
  setNodeListRowSpacing
} from '../../../nodes/components/nodeListRowSpacingSettings';

const SETTINGS_INPUT_CLASS_NAME =
  'w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground';

export function NodeListRowSpacingSection() {
  const [rowSpacing, setRowSpacing] = useState(() => getNodeListRowSpacing());

  return (
    <SettingsSection ariaLabel="Node list row spacing settings section" title="Node list">
      <SettingsRow
        description={`Set node list row spacing in pixels. The default is ${DEFAULT_NODE_LIST_ROW_SPACING}px.`}
        title="Row spacing"
      >
        <SettingsControlSlot>
          <label className="inline-flex w-[144px] max-w-full items-center gap-2">
            <span className="sr-only">Node list row spacing</span>
            <input
              aria-label="Node list row spacing"
              className={SETTINGS_INPUT_CLASS_NAME}
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
