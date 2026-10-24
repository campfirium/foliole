import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import { AppButton } from './Button';
import { SettingsNavigation, SettingsNavigationBrand, SettingsNavigationGroup } from './SettingsNavigation';

function NavigationExample() {
  const [selected, setSelected] = useState('Reading');
  return (
    <SettingsNavigation
      ariaLabel="Preferences"
      navigationLabel="Preference categories"
      title={<SettingsNavigationBrand badge="Preview" logo={<span>Leaf</span>} name="Reader" version="v1" />}
    >
      <SettingsNavigationGroup title="Workspace">
        {['Reading', 'Writing'].map((name) => (
          <AppButton aria-current={selected === name ? 'page' : undefined} key={name} onClick={() => setSelected(name)}>
            {name}
          </AppButton>
        ))}
      </SettingsNavigationGroup>
    </SettingsNavigation>
  );
}

it('supports a settings navigation without importing feature categories or product branding', () => {
  render(<NavigationExample />);
  const surface = screen.getByRole('complementary', { name: 'Preferences' });
  const navigation = within(surface).getByRole('navigation', { name: 'Preference categories' });
  for (const text of ['Leaf', 'Reader', 'Preview', 'v1', 'Workspace']) {
    expect(within(surface).getByText(text)).toBeVisible();
  }
  expect(within(navigation).getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(within(navigation).getByRole('button', { name: 'Writing' }));
  expect(within(navigation).getByRole('button', { name: 'Writing' })).toHaveAttribute('aria-current', 'page');
  expect(within(navigation).getByRole('button', { name: 'Reading' })).not.toHaveAttribute('aria-current');
});
