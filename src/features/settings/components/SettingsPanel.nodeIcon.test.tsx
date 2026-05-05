import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

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

function openAppearanceAndApplyNodeIconChanges() {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Topic node SVG'), {
    target: {
      value: '<svg viewBox="0 0 16 16"><path d="M2 12L14 4" fill="none" stroke="currentColor"/></svg>'
    }
  });
  fireEvent.change(screen.getByLabelText('Item node SVG'), {
    target: {
      value: '<svg viewBox="0 0 16 16"><path d="M2 4L14 12" fill="none" stroke="currentColor"/></svg>'
    }
  });
  fireEvent.change(screen.getByLabelText('Pending state stroke style'), { target: { value: 'solid' } });
  fireEvent.change(screen.getByLabelText('Pending state line width'), { target: { value: '2.4' } });
  fireEvent.change(screen.getByLabelText('Pending state color'), { target: { value: '#ff6600' } });
  fireEvent.change(screen.getByLabelText('Scheduled state stroke style'), { target: { value: 'dashed' } });
  fireEvent.change(screen.getByLabelText('Scheduled state line width'), { target: { value: '1.8' } });
  fireEvent.change(screen.getByLabelText('Scheduled state dash length'), { target: { value: '2.5' } });
  fireEvent.change(screen.getByLabelText('Dismissed state line width'), { target: { value: '1.6' } });
  fireEvent.change(screen.getByLabelText('Dismissed state color'), { target: { value: '#445566' } });
  fireEvent.change(screen.getByLabelText('Dismissed fade opacity'), { target: { value: '0.5' } });
  fireEvent.click(screen.getByLabelText('Fade the whole row'));
}

async function expectStoredNodeIconSettings() {
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg)).toContain('<svg');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg)).toContain('<svg');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle)).toBe('solid');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth)).toBe('2.4');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor)).toBe('#ff6600');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle)).toBe('dashed');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth)).toBe('1.8');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength)).toBe('2.5');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth)).toBe('1.6');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor)).toBe('#445566');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity)).toBe('0.5');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow)).toBe('false');
  });
}

function expectPreviewNodeIconSettings() {
  const preview = screen.getByLabelText('Node icon preview');
  expect(
    within(preview)
      .getByText('Topic pending')
      .closest('[data-node-icon-preview="reading-pending"]')
      ?.querySelector('[data-node-icon="leaf"]')
  ).toHaveAttribute('data-node-icon-pattern', 'normal');
  expect(
    within(preview)
      .getByText('Item scheduled')
      .closest('[data-node-icon-preview="review-scheduled"]')
      ?.querySelector('[data-node-icon="leaf"]')
  ).toHaveAttribute('data-node-icon-pattern', 'dash');
  expect(
    within(preview)
      .getByText('Item scheduled')
      .closest('[data-node-icon-preview="review-scheduled"]')
      ?.querySelector('[data-node-icon="leaf"]')
  ).toHaveStyle({ '--node-icon-stroke-width': '1.8' });
  expect(
    within(preview)
      .getByText('Topic dismissed')
      .closest('[data-node-icon-preview="reading-dismissed"]')
      ?.querySelector('[data-node-icon="leaf"]')
  ).toHaveStyle({ opacity: '0.5' });
}

async function expectNodeIconSettingsReset() {
  fireEvent.click(screen.getByRole('button', { name: 'Restore default node icon settings' }));
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled)).toBeNull();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity)).toBeNull();
  });
}

it('stores topic and item svg inputs plus per-state icon styling and restores defaults', async () => {
  openAppearanceAndApplyNodeIconChanges();
  await expectStoredNodeIconSettings();
  expectPreviewNodeIconSettings();
  await expectNodeIconSettingsReset();
});
