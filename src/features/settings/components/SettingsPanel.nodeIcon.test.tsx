import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { NodeTreeRowIcon } from '../../nodes/components/NodeTreeRowIcon';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));

vi.mock('./sections/SettingsRailIconPicker', () => ({
  IconGrid: (props: { onSelect: (iconId: string) => void }) => (
    <button aria-label="Use mocked icon" onClick={() => props.onSelect('BookOpen')} type="button">
      Book Open
    </button>
  ),
  matchesIconQuery: (values: Array<string | undefined>, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    return !normalizedQuery || values.some((value) => value?.toLowerCase().includes(normalizedQuery));
  }
}));

const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
});

function openAppearance() {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
}

function editSvg(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'book open' } });
  fireEvent.change(screen.getByLabelText('SVG'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
}

function editState(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

function readJsonSetting(key: string) {
  const value = window.localStorage.getItem(key);
  expect(value).toBeTruthy();
  return JSON.parse(value ?? '{}') as Record<string, unknown>;
}

async function expectStoredNodeIconSettings() {
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg)).toContain('<svg');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg)).toContain('<svg');
    expect(readJsonSetting(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance)).toMatchObject({
      effect: 'double-line',
      innerScale: 0.72,
      lineWidth: 1.8,
      outerScale: 1.2,
      scale: 1.15,
      svg: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>'
    });
  });
}

async function expectNodeIconSettingsReset() {
  fireEvent.click(screen.getByRole('button', { name: 'Reset Item scheduled' }));
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance)).toBeNull();
  });
}

it('stores compact topic and item icon rows plus per-state topic and item icon styling', async () => {
  openAppearance();
  editSvg('Edit Topic icon', '<svg viewBox="0 0 16 16"><path d="M2 12L14 4" fill="none" stroke="currentColor"/></svg>');
  editSvg('Edit Item icon', '<svg viewBox="0 0 16 16"><path d="M2 4L14 12" fill="none" stroke="currentColor"/></svg>');

  editState('Edit Item scheduled');
  fireEvent.change(screen.getByLabelText('Effect'), { target: { value: 'double-line' } });
  fireEvent.change(screen.getByLabelText('Line width'), { target: { value: '1.8' } });
  fireEvent.change(screen.getByLabelText('Scale'), { target: { value: '1.15' } });
  fireEvent.change(screen.getByLabelText('Outer scale'), { target: { value: '1.2' } });
  fireEvent.change(screen.getByLabelText('Inner scale'), { target: { value: '0.72' } });
  fireEvent.change(screen.getByLabelText('SVG'), {
    target: { value: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

  await expectStoredNodeIconSettings();
  await expectNodeIconSettingsReset();
}, 30000);

it('keeps base icon preview independent from state effects', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg,
    '<svg viewBox="0 0 16 16"><path d="M2 4L14 12" fill="none" stroke="currentColor"/></svg>'
  );
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance,
    JSON.stringify({
      effect: 'double-line',
      innerScale: 0.72,
      outerScale: 1.2,
      svg: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>'
    })
  );

  const statePreview = render(<NodeTreeRowIcon kind="review" preview state="scheduled" />);
  expect(statePreview.container.querySelector('svg[data-node-custom-slot="state"]')).not.toBeNull();
  expect(statePreview.container.querySelector('[data-node-icon-effect="double-line"]')).not.toBeNull();
  statePreview.unmount();

  const basePreview = render(<NodeTreeRowIcon baseOnly kind="review" preview state="scheduled" />);
  expect(basePreview.container.querySelector('svg[data-node-custom-slot="secondary"]')).not.toBeNull();
  expect(basePreview.container.querySelector('[data-node-icon-effect="double-line"]')).toBeNull();
});
