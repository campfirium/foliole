import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { buildWorkspaceSurfaceAutoColumnPalette } from '../model/workspaceSurfaceAutoPalette';
import { parseWorkspaceSurfaceColor } from '../model/workspaceSurfaceColor';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
});

it('persists workspace surface palette and region assignments from appearance settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add palette color' }));
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Palette color 6' }), { clientX: 320, clientY: 240 });
  fireEvent.change(screen.getByLabelText('Workspace surface palette hex'), { target: { value: '#c9d4e7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Palette color 6' }));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Main doc' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments) ?? '{}');
    expect(palette[5]).toBe('#c9d4e7');
    expect(assignments['main-document']).toBe(5);
  });
});

it('maps an automatic column palette into free-mode palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Olive' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments) ?? '{}');
    const seed = parseWorkspaceSurfaceColor('#8a962f');
    expect(seed).not.toBeNull();
    expect(palette.slice(0, 5)).toEqual(buildWorkspaceSurfaceAutoColumnPalette(seed!, {
      documentPureWhite: false,
      folderTopicSharedTone: false
    }));
    expect(assignments['main-document']).toBe(3);
  });
});

it('keeps automatic seed hex editable while also supporting the popover swatches', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Automatic workspace seed hex'), { target: { value: '#8a962f' } });

  await waitFor(() => {
    expect(screen.getByLabelText('Automatic workspace seed hex')).toHaveValue('#8a962f');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Gray' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Automatic workspace seed hex')).toHaveValue('#7a7a7a');
  });
});

it('applies the current automatic palette when clicking the automatic preview card', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Olive' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply automatic palette' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const seed = parseWorkspaceSurfaceColor('#8a962f');
    expect(seed).not.toBeNull();
    expect(palette.slice(0, 5)).toEqual(buildWorkspaceSurfaceAutoColumnPalette(seed!, {
      documentPureWhite: false,
      folderTopicSharedTone: false
    }));
    expect(screen.getByRole('button', { name: 'Apply automatic palette' }).className).toContain('border-border-strong');
  });
});

it('refreshes random palettes while keeping the current theme card in the first slot', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  const firstRandomCard = screen.getByRole('button', { name: 'Current random palette' });
  const before = firstRandomCard.innerHTML;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh random palettes' }));

  await waitFor(() => {
    const refreshedFirstCard = screen.getByRole('button', { name: 'Current random palette' });
    expect(refreshedFirstCard.innerHTML).toBe(before);
  });
});

it('applies a random palette into the leading workspace palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Random palette 2' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    expect(palette.slice(0, 5)).toHaveLength(5);
    expect(screen.getByText('Free palette')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Current random palette' }).className).toContain('border-border-strong');
  });
});

it('applies auto palette options before writing into the free palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Olive' }));
  fireEvent.click(screen.getByLabelText('Document stays white'));
  fireEvent.click(screen.getByLabelText('Folder and topic match'));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const seed = parseWorkspaceSurfaceColor('#8a962f');
    expect(seed).not.toBeNull();
    expect(palette.slice(0, 5)).toEqual(buildWorkspaceSurfaceAutoColumnPalette(seed!, {
      documentPureWhite: true,
      folderTopicSharedTone: true
    }));
  });
});

it('resets workspace surface settings back to the gray automatic default', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Olive' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Automatic workspace seed hex')).toHaveValue('#7a7a7a');
  });
});

it('restores workspace surface generator preferences and active mode from storage', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceGeneratorMode, 'automatic');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoSeed, '#8a962f');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoOptions, JSON.stringify({
    documentPureWhite: true,
    folderTopicSharedTone: true
  }));

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Document stays white')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Folder and topic match')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Automatic workspace seed hex')).toHaveValue('#8a962f');
  });
});

it('hides settings while preview mode is active and restores it on escape', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Settings dialog').className).toContain('opacity-0');
  });

  fireEvent.keyDown(window, { key: 'Escape' });

  await waitFor(() => {
    expect(screen.getByLabelText('Settings dialog').className).not.toContain('opacity-0');
  });
});
