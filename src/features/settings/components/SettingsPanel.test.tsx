import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, beforeEach, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';

import { SettingsPanel } from './SettingsPanel';
import {
  changePushQueueValues,
  createProps,
  expectPushQueueValues,
  openReviewSettings,
  renderWithMouseGestureProvider
} from './SettingsPanel.testUtils';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

function PushQueueSettingsHarness() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">
        Reopen settings
      </button>
      {isOpen ? <SettingsPanel {...createProps()} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

function expectPushQueueSemanticCopy() {
  expect(screen.getByRole('heading', { level: 4, name: 'Default topic priority' })).toBeInTheDocument();
  expect(screen.getByText('Reading vs review mix')).toBeInTheDocument();
  expect(screen.getByText('Priority weight')).toBeInTheDocument();
  expect(screen.getByText(/fallback priority for new topics/i)).toBeInTheDocument();
}

async function expectUpdatedPushQueueValues() {
  await waitFor(() => {
    expectPushQueueValues({
      reading: 2,
      fsrs: 4,
      defaultPriority: 4,
      priorityRatio: 7,
      readingInitialIntervalDays: 2,
      readingGrowthMin: 1.12,
      readingGrowthMax: 1.44
    });
  });
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('groups settings sidebar entries by workspace, data, and sources', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="library" />);

  expect(screen.getByText('General')).toBeInTheDocument();
  expect(screen.getByText('Workspace')).toBeInTheDocument();
  expect(screen.getByText('Controls')).toBeInTheDocument();
  expect(screen.getByText('Data')).toBeInTheDocument();
  expect(screen.getByText('Sources')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 3, name: 'Settings' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Models' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Storage' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('button', { name: 'Watched folders' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'External folders' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Reader' })).toBeInTheDocument();
});

it('shows models directly in General without adding a sidebar category', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="general" />);

  expect(screen.getByRole('heading', { level: 3, name: 'Models' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('button', { name: 'Manage AI services' })).not.toBeInTheDocument();
});

it('updates desired retention from review settings slider', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  openReviewSettings();
  fireEvent.change(screen.getByLabelText('Desired retention'), {
    target: { value: '0.8' }
  });

  await waitFor(() => {
    expect(screen.getByText('0.80')).toBeInTheDocument();
  });
});

it('updates remaining review scheduler controls from review settings section', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  openReviewSettings();
  fireEvent.change(screen.getByLabelText('Maximum interval days'), {
    target: { value: '365' }
  });
  fireEvent.change(screen.getByLabelText('New day starts at'), {
    target: { value: '6' }
  });

  await waitFor(() => {
    expect(screen.getByLabelText('Maximum interval days')).toHaveValue(365);
    expect(screen.getByLabelText('New day starts at')).toHaveValue('6');
  });
});

it('updates mouse gesture settings from the dedicated section and persists them', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />, {
    publicCommandItems: [
      {
        enabled: true,
        id: APP_COMMAND_IDS.scrollDocumentBottom,
        keywords: ['scroll', 'bottom'],
        section: 'Navigation',
        title: 'Scroll to bottom'
      }
    ]
  });

  fireEvent.click(screen.getByRole('button', { name: 'Mouse gestures' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Choose command for Left → Up' }), {
    key: 'Enter'
  });
  fireEvent.click(screen.getByRole('menuitem', { name: /Scroll to bottom/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Gesture appearance' }));
  fireEvent.change(screen.getByLabelText('Mouse gesture trail color hex'), {
    target: { value: '#ff5500' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail line width'), {
    target: { value: '4.5' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail opacity'), {
    target: { value: '0.6' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture direction threshold'), {
    target: { value: '24' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail point threshold'), {
    target: { value: '10' }
  });

  await waitFor(() => {
    expect(
      JSON.parse(
        window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.mouseGestureBindings) ?? '[]'
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandId: APP_COMMAND_IDS.scrollDocumentBottom,
          gesture: 'left-up'
        })
      ])
    );
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-color')).toBe('#ff5500');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-line-width')).toBe('4.5');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-opacity')).toBe('0.6');
    expect(window.localStorage.getItem('foliole-mouse-gesture-segment-threshold')).toBe('24');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-point-threshold')).toBe('10');
  });
});

it('updates appearance settings from the dedicated sections and persists them', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Editor' }));
  expect(screen.getByRole('switch', { name: 'Save remote images locally' }).className).toContain('bg-settings-switch-on');
  fireEvent.click(screen.getByLabelText('Save remote images locally'));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Accent color picker'), {
    target: { value: '#ff5500' }
  });
  fireEvent.click(screen.getByLabelText('Reset accent color'));
  fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
  fireEvent.change(screen.getByLabelText('Interface font size'), {
    target: { value: '22' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages)).toBe('false');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.accentColor)).toBe('#3f8f68');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.interfaceFontSize)).toBe('22');
  });
});

it('keeps push queue defaults, saved values, and reopened review fields in sync', async () => {
  renderWithMouseGestureProvider(<PushQueueSettingsHarness />);

  openReviewSettings();
  expectPushQueueSemanticCopy();
  expectPushQueueValues({
    reading: 1,
    fsrs: 5,
    defaultPriority: 5,
    priorityRatio: 5,
    readingInitialIntervalDays: 1,
    readingGrowthMin: 1.1,
    readingGrowthMax: 1.5
  });
  changePushQueueValues({
    reading: '2',
    fsrs: '4',
    defaultPriority: '4',
    priorityRatio: '7',
    readingInitialIntervalDays: '2',
    readingGrowthMin: '1.12',
    readingGrowthMax: '1.44'
  });

  await expectUpdatedPushQueueValues();

  fireEvent.click(screen.getByLabelText('Settings'));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Settings dialog' })).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Reopen settings' }));

  openReviewSettings();

  await expectUpdatedPushQueueValues();
});
