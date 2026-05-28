import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { buildWorkspaceSurfaceAutoColumnPalette } from '../model/workspaceSurfaceAutoPalette';
import { parseWorkspaceSurfaceColor } from '../model/workspaceSurfaceColor';
import { DEFAULT_WORKSPACE_SURFACE_PALETTE } from '../model/workspaceSurfaceSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(contextId: string) {
      if (contextId !== '2d') {
        return null;
      }
      return {
        font: '',
        measureText(text: string) {
          return { width: text.length * 8 };
        }
      };
    }
  });
});

afterAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: originalCanvasGetContext
  });
});

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
}, 15_000);

it('opens the collection panel, applies a saved theme, closes on outside click, and removes favorites', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Random palette 3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add current theme to favorites' }));
  fireEvent.click(screen.getByRole('button', { name: 'Random palette 4' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Open theme collection' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Open theme collection' }));

  await waitFor(() => {
    expect(screen.getByLabelText('Theme collection panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply favorite theme 1' })).toBeInTheDocument();
  });

  fireEvent.mouseDown(document.body);

  await waitFor(() => {
    expect(screen.queryByLabelText('Theme collection panel')).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Open theme collection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply favorite theme 1' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const favorites = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites) ?? '[]');
    expect(palette.slice(0, 5)).toEqual(favorites[0]);
    expect(screen.queryByLabelText('Theme collection panel')).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Open theme collection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove favorite theme 1' }));

  await waitFor(() => {
    const favorites = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites) ?? '[]');
    expect(favorites).toHaveLength(0);
  });
}, 15_000);

it('applies auto palette options before writing into the free palette slots', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Olive' }));
  fireEvent.click(screen.getByLabelText('Use neutral document surface'));
  fireEvent.click(screen.getByLabelText('Folder and topic share tone'));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const seed = parseWorkspaceSurfaceColor('#8a962f');
    expect(seed).not.toBeNull();
    expect(palette.slice(0, 5)).toEqual(buildWorkspaceSurfaceAutoColumnPalette(seed!, {
      documentPureWhite: true,
      folderTopicSharedTone: true
    }));
  });
}, 15_000);

it('resets workspace surface settings back to the product default theme', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use automatic seed Olive' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    expect(palette).toEqual(DEFAULT_WORKSPACE_SURFACE_PALETTE);
  });
});
