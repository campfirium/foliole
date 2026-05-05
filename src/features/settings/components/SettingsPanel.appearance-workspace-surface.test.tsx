import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { buildWorkspaceSurfaceAutoColumnPalette } from '../model/workspaceSurfaceAutoPalette';
import { parseWorkspaceSurfaceColor } from '../model/workspaceSurfaceColor';
import { WORKSPACE_SURFACE_RECOMMENDATION_SEEDS } from '../model/workspaceSurfaceColorRecommendations';

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

it('applies a recommended palette row into the leading workspace palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply recommended palette sage' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments) ?? '{}');
    const sageSeed = parseWorkspaceSurfaceColor(WORKSPACE_SURFACE_RECOMMENDATION_SEEDS.find((family) => family.id === 'sage')!.seed);
    expect(sageSeed).not.toBeNull();
    expect(palette.slice(0, 5)).toEqual(buildWorkspaceSurfaceAutoColumnPalette(sageSeed!, {
      documentPureWhite: false,
      folderTopicSharedTone: false
    }));
    expect(assignments['main-document']).toBe(3);
  });
});

it('maps an automatic column palette into free-mode palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Automatic workspace seed hex'), { target: { value: '#8a962f' } });

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
    expect(screen.getByText('Free palette')).toBeInTheDocument();
  });
});

it('applies auto palette options before writing into the free palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Automatic workspace seed hex'), { target: { value: '#8a962f' } });
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

it('applies recommended palette rows with current preferences', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByLabelText('Document stays white'));
  fireEvent.click(screen.getByLabelText('Folder and topic match'));
  fireEvent.click(screen.getByRole('button', { name: 'Apply recommended palette sage' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const sageSeed = parseWorkspaceSurfaceColor(WORKSPACE_SURFACE_RECOMMENDATION_SEEDS.find((family) => family.id === 'sage')!.seed);
    expect(sageSeed).not.toBeNull();
    expect(palette.slice(0, 5)).toEqual(buildWorkspaceSurfaceAutoColumnPalette(sageSeed!, {
      documentPureWhite: true,
      folderTopicSharedTone: true
    }));
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
