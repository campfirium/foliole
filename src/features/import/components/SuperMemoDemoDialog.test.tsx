// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';

import { SuperMemoDemoDialog } from './SuperMemoDemoDialog';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

beforeEach(() => {
  // jsdom has no IntersectionObserver, which the due timeline uses to hide clipped labels.
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.electronAPI;
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

it('walks from the sample source to the demo ending, keeping choices and calling no runtime', () => {
  const invoke = vi.fn(() => Promise.resolve(null));
  window.electronAPI = { invoke } as unknown as NonNullable<typeof window.electronAPI>;
  const onClose = vi.fn();
  renderWithLocalization(<SuperMemoDemoDialog onClose={onClose} />);
  expect(screen.getByText('Sample Collection')).toBeInTheDocument();

  click('Next');
  const folderSwitch = () => screen.getByRole('switch', { name: /^Use The Solar System #\d+ as a folder$/ });
  expect(folderSwitch()).toBeChecked();
  fireEvent.click(folderSwitch());

  click('Next');
  expect(screen.queryByText('There are no upcoming reviews at this weight.')).toBeNull();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });

  click('Next');
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Boundary between P0 and P1' }), { key: 'ArrowRight' });
  const boundary = () => screen.getByRole('slider', { name: 'Boundary between P0 and P1' }).getAttribute('aria-valuenow');
  const changedBoundary = boundary();

  click('Next');
  click('Finish demo');
  expect(screen.getByText(/Nothing was imported/)).toBeInTheDocument();

  click('Back');
  click('Back');
  expect(boundary()).toBe(changedBoundary);
  click('Back');
  expect(screen.getByRole('slider')).toHaveValue('60');
  click('Back');
  // As in the desktop dialog, a branch without folders starts collapsed when the step is shown again.
  click(/^Expand #14$/);
  expect(folderSwitch()).not.toBeChecked();

  click('Import settings');
  click('Finish demo');
  click('Close demo');
  expect(onClose).toHaveBeenCalledOnce();
  // The shared document editor syncs the global display scale; the walkthrough itself must send nothing else.
  expect(invoke.mock.calls.map((call: unknown[]) => call[0]).filter(command => command !== 'set_app_display_scale'))
    .toEqual([]);
});
