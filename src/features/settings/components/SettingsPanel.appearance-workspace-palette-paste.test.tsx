import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

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
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: vi.fn(async () => '#111111, #222222, #333333, #444444, #555555')
    }
  });
});

it('pastes five hex colors into the free workspace palette', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add palette color' }));
  fireEvent.click(screen.getByRole('button', { name: 'Palette color 6' }));
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Main document' }));
  fireEvent.click(screen.getByRole('button', { name: 'Paste free palette' }));

  await waitFor(() => {
    const palette = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfacePalette) ?? '[]');
    const assignments = JSON.parse(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAssignments) ?? '{}');
    expect(palette).toEqual(['#111111', '#222222', '#333333', '#444444', '#555555']);
    expect(assignments['main-document']).toBe(4);
    expect(screen.queryByRole('button', { name: 'Palette color 6' })).not.toBeInTheDocument();
  });
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('labels the free palette paste action with a tour tip', () => {
  vi.useFakeTimers();
  try {
    renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Paste free palette' }), { pointerType: 'mouse' });

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole('tooltip')).toHaveTextContent('Paste free palette');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Paste five comma-separated hex colors into the free palette.');
  } finally {
    vi.useRealTimers();
  }
});
