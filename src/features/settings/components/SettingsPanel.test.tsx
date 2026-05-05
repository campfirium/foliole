import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import {
  changePushQueueValues,
  createDeferred,
  createProps,
  expectPushQueueValues,
  openReviewSettings,
  renderWithMouseGestureProvider
} from './SettingsPanel.testUtils';

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
  expect(screen.getByRole('heading', { level: 4, name: 'Default node priority' })).toBeInTheDocument();
  expect(screen.getByText('Dual queue mix ratio')).toBeInTheDocument();
  expect(screen.getByText('Priority strength (`priorityRatio`)')).toBeInTheDocument();
  expect(screen.getByText(/global `defaultPriority` fallback/i)).toBeInTheDocument();
  expect(screen.getByText(/weight multiple of P1 relative to P9/i)).toBeInTheDocument();
  expect(screen.getByText(/weight ratio, not a percentage scale/i)).toBeInTheDocument();
  expect(screen.getByText(/default `1:5` means one reading draw is mixed after five FSRS draws/i)).toBeInTheDocument();
  expect(screen.getByText(/minimum maps to P1, the maximum maps to P9/i)).toBeInTheDocument();
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

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));
const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
});

it('groups settings sidebar entries by workspace, storage, and connections', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="library" />);

  const buttons = screen.getAllByRole('button');
  const labels = buttons.map((button) => button.textContent).filter(Boolean);

  expect(screen.getByText('Workspace')).toBeInTheDocument();
  expect(screen.getByText('Storage')).toBeInTheDocument();
  expect(screen.getByText('Connections')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 3, name: 'Settings' })).not.toBeInTheDocument();
  expect(labels.slice(0, 6)).toEqual(['General', 'Appearance', 'Editor', 'Review', 'Hotkeys', 'Mouse gestures']);
  expect(labels).toContain('Library');
  expect(labels).toContain('Watched folders');
  expect(labels).toContain('Readwise Reader');
  expect(labels).toContain('External sources');
  expect(labels.indexOf('Sync')).toBeGreaterThan(labels.indexOf('Library'));
  expect(labels.indexOf('Backups')).toBeGreaterThan(labels.indexOf('Sync'));
  expect(labels.indexOf('Readwise Reader')).toBeGreaterThan(labels.indexOf('Backups'));
  expect(labels.indexOf('Watched folders')).toBeGreaterThan(labels.indexOf('Readwise Reader'));
  expect(screen.getByRole('button', { name: 'Watched folders' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Readwise Reader' })).toBeInTheDocument();
});

it('renders direct Import content in the right panel instead of a jump button', async () => {
  renderWithMouseGestureProvider(
    <SettingsPanel
      {...createProps()}
      importCategoryContent={<div>Restored import panel content</div>}
      requestedCategory="import"
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Watched folders' })).toBeInTheDocument();
  expect(screen.getByText('Restored import panel content')).toBeInTheDocument();
});

it('renders direct Readwise Reader content in the right panel instead of a jump button', async () => {
  renderWithMouseGestureProvider(
    <SettingsPanel
      {...createProps()}
      readwiseReaderCategoryContent={<div>Restored Readwise Reader content</div>}
      requestedCategory="readwise-reader"
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Readwise Reader' })).toBeInTheDocument();
  expect(screen.getByText('Restored Readwise Reader content')).toBeInTheDocument();
});

it('keeps font selects disabled until system fonts are loaded', async () => {
  const deferred = createDeferred<{ fonts: string[]; monospaceFonts: string[] }>();
  mockedListAvailableSystemFonts.mockReturnValue(deferred.promise);

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));

  const uiSelect = screen.getByLabelText('Interface font');
  const textSelect = screen.getByLabelText('Text font');
  const monoSelect = screen.getByLabelText('Monospace font preset');
  expect(uiSelect).toBeDisabled();
  expect(textSelect).toBeDisabled();
  expect(monoSelect).toBeDisabled();

  deferred.resolve({ fonts: ['XHei-Believe'], monospaceFonts: ['XHei-Believe-Mono'] });

  await waitFor(() => {
    expect(uiSelect).toBeEnabled();
    expect(textSelect).toBeEnabled();
    expect(monoSelect).toBeEnabled();
  });
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
  fireEvent.change(screen.getByLabelText('Interval fuzz'), {
    target: { value: 'on' }
  });
  fireEvent.change(screen.getByLabelText('Short-term scheduling'), {
    target: { value: 'on' }
  });

  await waitFor(() => {
    expect(screen.getByLabelText('Maximum interval days')).toHaveValue(365);
    expect(screen.getByLabelText('Interval fuzz')).toHaveValue('on');
    expect(screen.getByLabelText('Short-term scheduling')).toHaveValue('on');
  });
});

it('updates mouse gesture settings from the dedicated section and persists them', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Mouse gestures' }));
  fireEvent.change(screen.getByLabelText('Left then up mouse gesture action'), {
    target: { value: 'scroll-bottom' }
  });
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
    expect(window.localStorage.getItem('foliole-mouse-gesture-left-up-action')).toBe('scroll-bottom');
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
  expect(screen.getByRole('switch', { name: 'Auto-localize remote images' }).className).toContain('bg-settings-switch-on');
  expect(screen.getByLabelText('Markdown syntax visibility').className).toContain('w-auto');
  fireEvent.click(screen.getByLabelText('Auto-localize remote images'));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Accent color picker'), {
    target: { value: '#ff5500' }
  });
  fireEvent.change(screen.getByLabelText('Interface font size'), {
    target: { value: '22' }
  });
  fireEvent.click(screen.getByLabelText('Reset accent color'));

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
