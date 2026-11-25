import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';

import { updateCompanionToolbarAppearance, useApplyCompanionToolbarAppearance } from './companionSelectionToolbarPreference';
import { CompanionImageFocusTransparencyControl, CompanionToolbarAppearanceControls } from './CompanionToolbarAppearanceControls';

const nativeMenu = vi.hoisted(() => ({ setNativeSelectionMenu: vi.fn(() => Promise.resolve()) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => nativeMenu
}));

beforeEach(() => {
  updateCompanionToolbarAppearance({ selectionToolbarEnabled: true, selectionToolbarOpacityPercent: 100, imageFocusTransparencyPercent: 50 });
  nativeMenu.setNativeSelectionMenu.mockClear();
});

function Harness() {
  useApplyCompanionToolbarAppearance();
  return <><CompanionToolbarAppearanceControls /><CompanionImageFocusTransparencyControl /></>;
}

it('hides the app selection toolbar, hands Android selection back to the system menu and keeps the choice', () => {
  render(<Harness />);
  expect(nativeMenu.setNativeSelectionMenu).toHaveBeenLastCalledWith({ enabled: false });
  const show = screen.getByRole('switch', { name: 'Show floating toolbar' });
  fireEvent.click(show);
  expect(show).toHaveAttribute('aria-checked', 'false');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarEnabled)).toBe('false');
  expect(nativeMenu.setNativeSelectionMenu).toHaveBeenLastCalledWith({ enabled: true });
  expect(screen.getByRole('slider', { name: 'Floating toolbar opacity' })).toBeDisabled();
});

it('applies toolbar opacity and image focus transparency through the shared desktop keys', () => {
  render(<Harness />);
  expect(document.documentElement.style.getPropertyValue('--app-image-focus-opacity')).toBe('0.5');
  fireEvent.change(screen.getByRole('slider', { name: 'Floating toolbar opacity' }), { target: { value: '40' } });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.selectionToolbarOpacityPercent)).toBe('40');
  expect(document.documentElement.style.getPropertyValue('--app-selection-toolbar-opacity')).toBe('0.4');
  fireEvent.change(screen.getByRole('slider', { name: 'Focus transparency' }), { target: { value: '70' } });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.imageFocusTransparencyPercent)).toBe('70');
  expect(document.documentElement.style.getPropertyValue('--app-image-focus-opacity')).toBe('0.3');
  expect(screen.getByText('70%')).toBeInTheDocument();
});
