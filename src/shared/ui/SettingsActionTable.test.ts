import { describe, expect, it } from 'vitest';

import { settingsActionTableHeaderClassName } from './SettingsActionTable';

describe('settingsActionTableHeaderClassName', () => {
  it('keeps the divider aligned with row content padding', () => {
    const className = settingsActionTableHeaderClassName('grid-cols-1');
    const classes = className.split(' ');

    expect(classes).not.toContain('border-b');
    expect(classes).toContain('after:left-4');
    expect(classes).toContain('after:right-4');
    expect(classes).toContain('after:border-b');
  });
});
