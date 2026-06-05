import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import type { CompanionTabConfig } from './CompanionTabsConfig';
import { CompanionTabsSettingsContent } from './CompanionTabsSettingsContent';

const BASE_CONFIG: CompanionTabConfig = {
  orderedTabIds: ['browse', 'learn', 'search', 'settings', 'shortcut'],
  shortcut: {
    destinationId: 'directory',
    enabled: true
  }
};

describe('CompanionTabsSettingsContent', () => {
  it('does not persist an invalid shortcut destination from the select event', () => {
    const onConfigChange = vi.fn();

    renderWithLocalization(<CompanionTabsSettingsContent config={BASE_CONFIG} onConfigChange={onConfigChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Shortcut tab target' }), {
      target: { value: 'bad-destination' }
    });

    expect(onConfigChange).toHaveBeenCalledWith({
      ...BASE_CONFIG,
      shortcut: {
        destinationId: 'directory',
        enabled: false
      }
    });
  });
});
