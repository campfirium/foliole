// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import type { SuperMemoReferenceMap } from '../../../../lib/core/import/superMemoReferenceFields';

import { SuperMemoReferenceSettings } from './SuperMemoReferenceSettings';

function ReferenceSettingsHarness() {
  const [mapping, setMapping] = useState<SuperMemoReferenceMap>({});
  return <SuperMemoReferenceSettings mapping={mapping} onChange={setMapping} disabled={false} />;
}

it('shows the Foliole example and updates expanded metadata when a field is renamed or skipped', () => {
  const { container } = render(<ReferenceSettingsHarness />);
  const preview = within(screen.getByRole('article', { name: 'Preview' }));
  expect(preview.getByText('Campfirium')).toBeVisible();
  const yaml = container.querySelector('pre');
  expect(yaml).not.toBeVisible();
  fireEvent.click(preview.getByRole('button', { name: 'meta' }));
  expect(yaml).toBeVisible();
  expect(yaml).toHaveTextContent('Date: 2026-02-25');
  expect(yaml).toHaveTextContent('Source: https://github.com/campfirium/foliole');
  expect(yaml).not.toHaveTextContent('Comment:');
  expect(yaml).not.toHaveTextContent('Article:');

  fireEvent.change(screen.getByRole('textbox', { name: 'Author import field name' }), { target: { value: 'byline' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Source import field name' }), { target: { value: '' } });
  expect(yaml).toHaveTextContent('byline: Campfirium');
  expect(yaml).not.toHaveTextContent('Source:');
  expect(preview.getByText('Campfirium')).toBeVisible();
  fireEvent.click(preview.getByRole('button', { name: 'Close' }));
  expect(yaml).not.toBeVisible();
});
