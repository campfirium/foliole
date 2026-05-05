import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { buildWorkspaceSurfaceAutoColumnPalette } from '../model/workspaceSurfaceAutoPalette';
import { parseWorkspaceSurfaceColor } from '../model/workspaceSurfaceColor';

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

it('resets the free palette back to five colors', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add palette color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Palette color 6' }));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Main doc' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset free palette' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments) ?? '{}');
    expect(palette).toHaveLength(5);
    expect(assignments['main-document']).toBe(4);
    expect(screen.queryByRole('button', { name: 'Palette color 6' })).not.toBeInTheDocument();
  });
});

it('stores workspace surface settings in the active base color mode', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'dark' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add palette color' }));
  fireEvent.doubleClick(screen.getByRole('button', { name: 'Palette color 6' }), { clientX: 320, clientY: 240 });
  fireEvent.change(screen.getByLabelText('Workspace surface palette hex'), { target: { value: '#26342e' } });
  fireEvent.click(screen.getByRole('button', { name: 'Palette color 6' }));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Main doc' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignmentsDark) ?? '{}');
    expect(palette[5]).toBe('#26342e');
    expect(assignments['main-document']).toBe(5);
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette)).toBeNull();
  });
});

it('uses dark automatic workspace generation when editing dark appearance', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'dark' } });
  fireEvent.change(screen.getByLabelText('Automatic workspace seed hex'), { target: { value: '#30362f' } });

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePaletteDark) ?? '[]');
    expect(palette.slice(0, 5).every((color: string) => {
      const parsed = parseWorkspaceSurfaceColor(color);
      return parsed && Math.max(parsed.r, parsed.g, parsed.b) < 90;
    })).toBe(true);
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette)).toBeNull();
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
    expect(screen.getByRole('button', { name: 'Apply automatic palette' }).className).toContain('border-settings-control-border-hover');
  });
});

it('refreshes all eight random palettes without reserving the first slot for the current palette', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  const firstRandomCard = screen.getByRole('button', { name: 'Random palette 1' });
  const before = firstRandomCard.innerHTML;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh random palettes' }));

  await waitFor(() => {
    const refreshedFirstCard = screen.getByRole('button', { name: 'Random palette 1' });
    expect(refreshedFirstCard.innerHTML).not.toBe(before);
  });
});

it('applies a random palette into the leading workspace palette slots and stores it in recent history', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Random palette 2' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const history = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistory) ?? '[]');
    expect(palette.slice(0, 5)).toHaveLength(5);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(palette.slice(0, 5));
    expect(screen.getByText('Free palette')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore theme history 1' })).toBeInTheDocument();
  });
});

it('restores a saved random palette from the persistent history slots', async () => {
  const randomHistory = [
    ['#8c7b68', '#ddd1c1', '#ebe1d3', '#faf6f0', '#e7dbc9'],
    ['#657f79', '#b8d0ca', '#d9ebe7', '#f8fbfa', '#d0e3de']
  ];
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistory, JSON.stringify(randomHistory));

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore theme history 2' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const history = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistory) ?? '[]');
    expect(palette.slice(0, 5)).toEqual(randomHistory[1]);
    expect(history[0]).toEqual(randomHistory[1]);
  });
});

it('toggles the current theme favorite', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Random palette 3' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Add current theme to favorites' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Add current theme to favorites' }));

  await waitFor(() => {
    const favorites = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites) ?? '[]');
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    expect(favorites[0]).toEqual(palette.slice(0, 5));
    expect(screen.getByRole('button', { name: 'Remove current theme from favorites' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Remove current theme from favorites' }));

  await waitFor(() => {
    const favorites = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites) ?? '[]');
    expect(favorites).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add current theme to favorites' })).toBeInTheDocument();
  });
});

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
});

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
    expect(screen.getByLabelText('Use neutral document surface')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Folder and topic share tone')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Automatic workspace seed hex')).toHaveValue('#8a962f');
  });
});

it('keeps workspace preview lines on the workspace divider without a gray fill', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));

  await waitFor(() => {
    const mainDocumentCell = screen.getByRole('button', { name: 'Main doc' });
    const grid = mainDocumentCell.parentElement;
    const gridFrame = grid?.parentElement;
    expect(gridFrame).toBeInstanceOf(HTMLDivElement);
    expect(gridFrame).toHaveClass('bg-transparent');
    expect(gridFrame?.getAttribute('class')).not.toContain('border-settings-divider');
    expect(grid).toHaveClass('bg-divider');
    expect(mainDocumentCell?.getAttribute('class')).not.toContain('border-settings-divider');
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
