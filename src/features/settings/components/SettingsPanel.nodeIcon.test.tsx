import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function openIconEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

function getMarkerRow(title: string) {
  const row = document.querySelector(`[data-node-icon-settings-row="${title}"]`);
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function editSvg(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'book open' } });
  fireEvent.change(screen.getByLabelText('SVG'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
}

function editStateSvg(label: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.change(screen.getByLabelText('SVG'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
}

function changeRange(rowTitle: string, label: string, value: string) {
  fireEvent.change(within(getMarkerRow(rowTitle)).getByLabelText(label), { target: { value } });
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
      lineWidth: 1.8,
      outerLineWidth: 1.4,
      outerScale: 1.2,
      svg: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>'
    });
  });
}

async function expectNodeIconSettingsReset() {
  fireEvent.click(screen.getByRole('button', { name: 'Reset Item Scheduled' }));
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance)).toBeNull();
  });
}

it('stores compact topic and item icon rows plus per-state topic and item icon styling', async () => {
  openAppearance();
  openIconEditor();
  editSvg('Edit Topic Base shape', '<svg viewBox="0 0 16 16"><path d="M2 12L14 4" fill="none" stroke="currentColor"/></svg>');
  editSvg('Edit Item Base shape', '<svg viewBox="0 0 16 16"><path d="M2 4L14 12" fill="none" stroke="currentColor"/></svg>');

  changeRange('Item Scheduled', 'Stroke', '1.8');
  changeRange('Item Scheduled', 'Ring scale', '1.2');
  changeRange('Item Scheduled', 'Ring stroke', '1.4');
  editStateSvg('Edit Item Scheduled shape', '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg>');

  await expectStoredNodeIconSettings();
  await expectNodeIconSettingsReset();
}, 30000);

it('uses compact icon defaults and closes nested icon editing before settings', () => {
  const onClose = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  openIconEditor();
  const topicIconRow = within(getMarkerRow('Topic Base'));

  expect(topicIconRow.getByLabelText('Stroke')).toHaveValue(0.6);
  expect(topicIconRow.getByLabelText('Scale')).toHaveValue(1.15);
  expect(topicIconRow.queryByLabelText('Stroke slider')).not.toBeInTheDocument();
  fireEvent.focus(topicIconRow.getByLabelText('Stroke'));
  expect(topicIconRow.getByLabelText('Stroke slider')).toBeInTheDocument();
  expect(screen.queryByText('#202124')).not.toBeInTheDocument();
  fireEvent.click(topicIconRow.getByRole('button', { name: 'Edit Topic Base shape' }));
  expect(screen.getByLabelText('Search icons').className).toContain('focus-visible:ring-0');

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.queryByRole('dialog', { name: 'Edit Topic Base marker' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Settings dialog')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it('uses a switch for dismissed row fade and keeps fade off by default', () => {
  openAppearance();
  openIconEditor();
  const dismissedRow = within(getMarkerRow('Topic Dismissed'));

  expect(dismissedRow.getByLabelText('Opacity')).toHaveValue(1);
  const applySwitch = dismissedRow.getByRole('switch', { name: 'Apply to row' });
  expect(applySwitch).toHaveAttribute('aria-checked', 'true');

  expect(screen.queryByLabelText('Item Dismissed')).not.toBeInTheDocument();
});

it('shows marker rows for the active marker kind', () => {
  openAppearance();
  openIconEditor();

  expect(screen.getByRole('dialog', { name: 'Navigation icons' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Topics' })).not.toBeInTheDocument();
  expect(getMarkerRow('Topic Pending')).toBeInTheDocument();
  expect(getMarkerRow('Topic Scheduled')).toBeInTheDocument();
  expect(getMarkerRow('Topic Dismissed')).toBeInTheDocument();
  expect(getMarkerRow('Item Pending')).toBeInTheDocument();
  expect(getMarkerRow('Item Scheduled')).toBeInTheDocument();
  expect(screen.getByText('Item pending')).toBeInTheDocument();
  expect(screen.queryByLabelText('Item Dismissed')).not.toBeInTheDocument();
});

it('keeps the settings page compact until the icon editor is opened', () => {
  openAppearance();

  expect(screen.getByText('Navigation icons')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit' }).querySelector('svg')).toBeNull();
  expect(screen.getAllByRole('group', { name: /^(Topic|Item) (icon|pending|scheduled|dismissed)$/ })).toHaveLength(7);
  expect(screen.queryByRole('group', { name: 'Item dismissed' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Scale')).not.toBeInTheDocument();

  openIconEditor();

  expect(within(getMarkerRow('Topic Base')).getByLabelText('Scale')).toBeInTheDocument();
});

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

it('uses the theme-aware default color until the icon color is customized', () => {
  const defaultPreview = render(<NodeTreeRowIcon kind="reading" preview state="pending" />);
  const defaultIcon = defaultPreview.container.querySelector<HTMLElement>('[data-node-icon="leaf"]');
  expect(defaultIcon).not.toBeNull();
  expect(defaultIcon?.style.getPropertyValue('--node-icon-custom-color')).toBe('');
  defaultPreview.unmount();

  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingTopicAppearance,
    JSON.stringify({ color: '#7c3aed' })
  );

  const customPreview = render(<NodeTreeRowIcon kind="reading" preview state="pending" />);
  expect(customPreview.container.querySelector<HTMLElement>('[data-node-icon="leaf"]')?.style.getPropertyValue('--node-icon-custom-color')).toBe('#7c3aed');
});
